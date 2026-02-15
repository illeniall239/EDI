"""
Knowledge Base RAG (Retrieval-Augmented Generation) Engine

This module implements the RAG pipeline for knowledge bases, combining:
- Vector similarity search on document chunks (pgvector)
- SQL queries on structured data
- Predictive analytics on extracted tables
- LLM-based synthesis with source citations

Author: EDI.ai Team
Date: 2025-12-31
"""

import logging
import os
from typing import Dict, List, Optional, Any
from datetime import datetime
import numpy as np
from sentence_transformers import SentenceTransformer, CrossEncoder
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

# Setup logging
logger = logging.getLogger(__name__)


class KnowledgeBaseRAG:
    """
    Hybrid retrieval engine combining vector search, SQL, and predictive analytics.

    Features:
    - Vector similarity search on document chunks using pgvector
    - Structured data context from CSV/Excel files
    - Extracted table context from PDFs/DOCX
    - LLM synthesis with source citations
    - Query classification (RAG, SQL, Prediction, Hybrid)
    """

    def __init__(self, llm, embedding_model: str, supabase_client):
        """
        Initialize RAG engine.

        Args:
            llm: LangChain LLM instance for synthesis
            embedding_model: Model name for embeddings (must match DocumentProcessor)
            supabase_client: Supabase client for database access
        """
        logger.info(f"Initializing KnowledgeBaseRAG with embedding model: {embedding_model}")

        self.llm = llm
        self.supabase = supabase_client

        try:
            self.embedding_model = SentenceTransformer(embedding_model)
            logger.info("Embedding model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise

        # Initialize cross-encoder for reranking
        try:
            self.reranker = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
            logger.info("Cross-encoder reranker loaded successfully")
        except Exception as e:
            logger.warning(f"Failed to load cross-encoder: {e}. Reranking will be disabled.")
            self.reranker = None

        # Initialize caching for metadata (structured data context)
        self._metadata_cache = {}  # {kb_id: (data, timestamp)}
        self._cache_ttl = 300  # 5 minutes TTL
        logger.info("Metadata cache initialized with 5 minute TTL")

        # Initialize connection pooling for SQLite databases
        self._engine_pool = {}  # {db_path: engine}
        logger.info("Connection pool initialized for SQLite databases")

    def _get_engine(self, db_path: str):
        """
        Get or create a pooled SQLAlchemy engine for the given database path.

        This implements connection pooling to avoid repeatedly creating new
        engine instances for the same database, which improves performance
        when querying multiple files or making repeated queries.

        Args:
            db_path: Path to the SQLite database file

        Returns:
            SQLAlchemy engine instance
        """
        if db_path not in self._engine_pool:
            logger.debug(f"Creating new pooled engine for {db_path}")
            self._engine_pool[db_path] = create_engine(
                f'sqlite:///{db_path}',
                poolclass=StaticPool,  # Reuse connections
                connect_args={
                    'check_same_thread': False,  # Allow multi-threaded access
                    'timeout': 30  # 30 second timeout for locked databases
                }
            )
        return self._engine_pool[db_path]

    def query_kb(
        self,
        kb_id: str,
        query: str,
        top_k: int = 5,
        conversation_history: List[Dict] = None
    ) -> Dict:
        """
        Main query method for knowledge base.

        This orchestrates the full RAG pipeline:
        1. Generate query embedding
        2. Vector similarity search
        3. Fetch structured data context
        4. Build combined context
        5. LLM synthesis

        Args:
            kb_id: Knowledge base ID
            query: User's natural language query
            top_k: Number of similar chunks to retrieve
            conversation_history: List of previous messages for context (optional)

        Returns:
            Dict containing:
                - response: LLM-generated answer
                - sources: List of document sources
                - structured_data_used: Boolean
                - chunks: Retrieved document chunks
        """
        logger.info(f"Querying KB {kb_id}: {query}")

        try:
            # Step 1: Generate query embedding
            query_embedding = self._generate_query_embedding(query)

            # Step 2: Enhanced vector similarity search with query text
            chunks = self._vector_search(kb_id, query_embedding, top_k, query_text=query)
            logger.info(f"Retrieved {len(chunks)} relevant chunks")

            # Step 3: Get structured data context
            structured_context = self._get_structured_data_context(kb_id)

            # Step 3.5: Query structured data if relevant
            sql_results = ""
            if structured_context['structured_files'] or structured_context['extracted_tables']:
                sql_results = self._query_structured_data(query, structured_context, conversation_history=conversation_history)
                if sql_results:
                    logger.info(f"Generated SQL results: {len(sql_results)} chars")

            # Step 3.6: Check if visualization is needed
            visualization_info = self.should_generate_visualization(query, sql_results)

            # Step 4: Build combined context
            context = self._build_context(chunks, structured_context, sql_results)

            # Step 5: Generate LLM response
            response = self._generate_response(query, context, chunks, conversation_history=conversation_history)

            result = {
                'response': response,
                'sources': self._format_sources(chunks),
                'structured_data_used': len(structured_context['structured_files']) > 0 or len(structured_context['extracted_tables']) > 0,
                'chunks': chunks,
                'num_sources': len(chunks),
                'sql_results': sql_results
            }

            # Add visualization metadata if needed
            if visualization_info.get('should_visualize'):
                result['visualization_needed'] = visualization_info

            return result

        except Exception as e:
            logger.error(f"Error querying KB: {e}")
            return {
                'error': str(e),
                'response': f"I encountered an error while searching the knowledge base: {str(e)}",
                'sources': [],
                'structured_data_used': False
            }

    def _generate_query_embedding(self, query: str) -> np.ndarray:
        """
        Generate embedding for user query.

        Args:
            query: User's question

        Returns:
            NumPy array (384-dimensional)
        """
        logger.debug(f"Generating embedding for query: {query[:50]}...")

        try:
            embedding = self.embedding_model.encode([query], convert_to_numpy=True)[0]
            return embedding
        except Exception as e:
            logger.error(f"Error generating query embedding: {e}")
            raise

    def _vector_search(self, kb_id: str, query_embedding: np.ndarray, top_k: int,
                      query_text: str = None, use_enhancement: bool = True) -> List[Dict]:
        """
        Enhanced vector similarity search with query expansion, reranking, and MMR.

        Pipeline:
        1. Query expansion (if query_text provided) - generate multiple query variants
        2. Multi-query retrieval - retrieve more candidates from all variants
        3. Cross-encoder reranking - score candidates for true relevance
        4. MMR diversity - select diverse top_k results

        Args:
            kb_id: Knowledge base ID
            query_embedding: Query embedding vector
            top_k: Number of final results to return
            query_text: Original query text (needed for expansion and reranking)
            use_enhancement: If False, use basic vector search only

        Returns:
            List of dicts with id, document_id, content, chunk_metadata, similarity, rerank_score
        """
        logger.debug(f"Performing vector search for KB {kb_id}, top_k={top_k}, enhanced={use_enhancement}")

        # Basic search if enhancement disabled or query_text not provided
        if not use_enhancement or not query_text:
            return self._basic_vector_search(kb_id, query_embedding, top_k)

        try:
            # Step 1: Query expansion - generate query variants
            query_variants = self._expand_query(query_text)
            logger.info(f"Generated {len(query_variants)} query variants")

            # Step 2: Multi-query retrieval - retrieve candidates from all variants
            # Retrieve 2x top_k to ensure diversity after reranking (optimized for performance)
            candidates_per_query = max(top_k * 2, 10)
            all_candidates = {}  # Use dict to deduplicate by chunk ID

            for variant in query_variants:
                variant_embedding = self.embedding_model.encode([variant], convert_to_numpy=True)[0]

                result = self.supabase.rpc(
                    'match_kb_documents',
                    {
                        'query_embedding': variant_embedding.tolist(),
                        'kb_id_param': kb_id,
                        'match_count': candidates_per_query
                    }
                ).execute()

                if result.data:
                    for chunk in result.data:
                        chunk_id = chunk.get('id')
                        # Keep chunk with highest similarity if duplicate
                        if chunk_id not in all_candidates or chunk.get('similarity', 0) > all_candidates[chunk_id].get('similarity', 0):
                            all_candidates[chunk_id] = chunk

            unique_candidates = list(all_candidates.values())
            logger.info(f"Multi-query retrieval found {len(unique_candidates)} unique candidates")

            if not unique_candidates:
                return []

            # Step 3: Cross-encoder reranking - get true relevance scores
            # Rerank with 2x top_k to provide good candidates for MMR
            reranked = self._rerank_results(query_text, unique_candidates, top_k=min(top_k * 2, len(unique_candidates)))
            logger.info(f"Reranked to {len(reranked)} candidates")

            # Step 4: MMR diversity - select diverse final results
            # Use original query embedding for MMR
            diverse_results = self._apply_mmr(query_embedding, reranked, lambda_param=0.7, top_k=top_k)
            logger.info(f"MMR selected {len(diverse_results)} diverse results")

            return diverse_results

        except Exception as e:
            logger.error(f"Error in enhanced vector search: {e}. Falling back to basic search.")
            # Fallback to basic search on error
            return self._basic_vector_search(kb_id, query_embedding, top_k)

    def _basic_vector_search(self, kb_id: str, query_embedding: np.ndarray, top_k: int) -> List[Dict]:
        """
        Basic vector similarity search using pgvector (fallback method).

        Calls the Supabase RPC function match_kb_documents() which uses
        pgvector's <=> operator for cosine distance.

        Args:
            kb_id: Knowledge base ID
            query_embedding: Query embedding vector
            top_k: Number of results to return

        Returns:
            List of dicts with id, document_id, content, chunk_metadata, similarity
        """
        logger.debug(f"Performing basic vector search for KB {kb_id}, top_k={top_k}")

        try:
            result = self.supabase.rpc(
                'match_kb_documents',
                {
                    'query_embedding': query_embedding.tolist(),
                    'kb_id_param': kb_id,
                    'match_count': top_k
                }
            ).execute()

            chunks = result.data if result.data else []
            logger.info(f"Basic vector search returned {len(chunks)} results")

            return chunks

        except Exception as e:
            logger.error(f"Error in basic vector search: {e}")
            # Return empty list on error instead of failing completely
            return []

    def _get_structured_data_context(self, kb_id: str) -> Dict:
        """
        Get metadata about available structured datasets in KB (with caching).

        This method implements a cache layer to avoid redundant database queries
        for structured data metadata, which rarely changes during a session.

        Args:
            kb_id: Knowledge base ID

        Returns:
            Dict with structured_files and extracted_tables lists
        """
        now = datetime.now()

        # Check cache
        if kb_id in self._metadata_cache:
            data, timestamp = self._metadata_cache[kb_id]
            cache_age = (now - timestamp).total_seconds()
            if cache_age < self._cache_ttl:
                logger.info(f"Cache hit for kb_id: {kb_id} (age: {cache_age:.1f}s)")
                return data
            else:
                logger.debug(f"Cache expired for kb_id: {kb_id} (age: {cache_age:.1f}s)")

        # Cache miss or expired - fetch from database
        logger.debug(f"Cache miss for kb_id: {kb_id}, fetching from database")
        data = self._fetch_structured_data_context(kb_id)
        self._metadata_cache[kb_id] = (data, now)
        return data

    def _fetch_structured_data_context(self, kb_id: str) -> Dict:
        """
        Fetch metadata about available structured datasets in KB from database.

        This provides context about what data is available for SQL queries
        and predictive analytics.

        Args:
            kb_id: Knowledge base ID

        Returns:
            Dict with structured_files and extracted_tables lists
        """
        logger.debug(f"Fetching structured data context for KB {kb_id}")

        try:
            # Fetch structured data files (CSV, Excel) - select only needed columns
            struct_data_result = self.supabase.table('kb_structured_data') \
                .select('id, filename, temp_db_path, column_names, row_count') \
                .eq('kb_id', kb_id) \
                .execute()

            # Fetch extracted tables from documents - select only needed columns
            extracted_tables_result = self.supabase.table('kb_extracted_tables') \
                .select('id, filename, temp_db_path, table_name, column_names') \
                .eq('kb_id', kb_id) \
                .execute()

            structured_files = struct_data_result.data if struct_data_result.data else []
            extracted_tables = extracted_tables_result.data if extracted_tables_result.data else []

            logger.info(f"Found {len(structured_files)} structured files, {len(extracted_tables)} extracted tables")

            return {
                'structured_files': structured_files,
                'extracted_tables': extracted_tables
            }

        except Exception as e:
            logger.error(f"Error fetching structured data context: {e}")
            return {'structured_files': [], 'extracted_tables': []}

    def _query_structured_data(
        self,
        query: str,
        structured_ctx: Dict,
        conversation_history: List[Dict] = None
    ) -> str:
        """
        Generate and execute SQL queries on structured data files.
        """
        results = []
        
        # Execute SQL for queries classified as sql/hybrid
        # OR when we have structured data (to handle cases where only Excel exists)
        classification = self.classify_query_type(query)

        # If not a sql/hybrid query and no structured files, skip SQL execution
        if classification['type'] not in ['sql', 'hybrid']:
            # Still try SQL if we have data files (handles "tell me about X" queries)
            if not structured_ctx['structured_files']:
                return ""
            # For RAG queries, only use SQL if confidence is low (uncertain classification)
            if classification.get('confidence', 0) > 0.7:
                logger.debug(f"Skipping SQL for high-confidence {classification['type']} query")
                # Actually, let's still try SQL for now to be safe
                pass

        for file_info in structured_ctx['structured_files']:
            try:
                filename = file_info.get('filename')
                db_path = file_info.get('temp_db_path')
                columns = file_info.get('column_names', [])
                
                # Validate database path exists
                if not db_path or not os.path.exists(db_path):
                    logger.warning(f"Database path not found: {db_path}")
                    continue

                # Fetch sample data to show LLM what's in each column (using pooled connection)
                engine = self._get_engine(db_path)
                column_info_list = []
                try:
                    with engine.connect() as conn:
                        sample_result = conn.execute(text('SELECT * FROM data_table LIMIT 2'))
                        sample_rows = sample_result.fetchall()

                        # Build column descriptions with sample values
                        for i, col in enumerate(columns):
                            sample_vals = [str(row[i])[:50] for row in sample_rows if row[i] is not None]
                            if sample_vals:
                                column_info_list.append(f'  - {col} (e.g., "{sample_vals[0]}")')
                            else:
                                column_info_list.append(f'  - {col}')

                        column_info = '\n'.join(column_info_list)
                except Exception as e:
                    logger.warning(f"Failed to fetch sample data: {e}")
                    # Fallback to just column names
                    column_info = '\n'.join([f'  - {col}' for col in columns])

                # Build conversation context string for SQL generation
                conversation_context = ""
                if conversation_history and len(conversation_history) > 0:
                    conversation_context = "Recent Conversation:\n"
                    for msg in conversation_history[-6:]:  # Last 3 exchanges (6 messages)
                        role = msg.get('role', 'unknown')
                        content = msg.get('content', '')
                        # Truncate long messages
                        content_preview = content[:200] + '...' if len(content) > 200 else content
                        conversation_context += f"{role.capitalize()}: {content_preview}\n"
                    conversation_context += "\n"

                # Generate SQL using LLM with improved prompt showing sample data
                prompt = f"""You are a SQL expert. Generate a SQLite query for this question.

{conversation_context}Table: data_table
File: {filename}

Columns and sample values:
{column_info}

User Question: {query}

General Guidelines:
- Use column names EXACTLY as shown (with spaces, hyphens, etc.) in double quotes
- For date columns, extract year using: strftime('%Y', "column_name")
- Analyze the user's question to determine which columns to filter/group/aggregate
- Use appropriate SQL functions (SUM, COUNT, AVG, etc.) based on the question
- Apply LIMIT based on question context ("top 5" = LIMIT 5, "top 10" = LIMIT 10, etc.)
- Make text searches case-insensitive using LOWER()
- Use LIKE with wildcards for text matching: WHERE LOWER("column") LIKE '%keyword%'

IMPORTANT - Conversation Context:
- If the user uses pronouns (she, he, it, they), look at the recent conversation to resolve them
- If the user says "the writer" or "the drama" or "that channel", use context to identify what they're referring to
- Build upon previous questions and answers - the conversation flows together

Examples:
Previous: "Huma Hina Nafees has the highest GRPs"
Current: "which channel has she released most dramas on"
→ Resolve "she" = "Huma Hina Nafees", generate: SELECT "Channel", COUNT(*) FROM data_table WHERE LOWER("Writer") LIKE '%huma hina nafees%' OR LOWER("Writer 2") LIKE '%huma hina nafees%' OR LOWER("Writer 3") LIKE '%huma hina nafees%' GROUP BY "Channel" ORDER BY COUNT(*) DESC LIMIT 1

Return ONLY the SQL query, no markdown or explanation.
"""
                logger.info(f"Generating SQL for query: {query}")
                response = self.llm.invoke(prompt)
                sql_query = response.content if hasattr(response, 'content') else str(response)
                logger.info(f"Generated SQL: {sql_query}")
                
                # Clean SQL
                sql_query = sql_query.replace('```sql', '').replace('```', '').strip()

                # Execute (using pooled connection)
                engine = self._get_engine(db_path)
                with engine.connect() as conn:
                    result = conn.execute(text(sql_query))
                    rows = result.fetchmany(size=100)  # Limit to 100 rows for performance
                    keys = result.keys()
                    
                    if rows:
                        results.append(f"Results from {filename}:")
                        # Format as markdown table or list (show first 5)
                        for row in rows[:5]:
                            # Round float values to whole numbers
                            rounded_row = [round(val) if isinstance(val, float) else val for val in row]
                            row_dict = dict(zip(keys, rounded_row))
                            results.append(str(row_dict))
                        if len(rows) > 5:
                            results.append(f"... (showing 5 of {len(rows)} rows fetched, limited to 100 for performance)")
                            
            except Exception as e:
                logger.warning(f"Failed to query {filename}: {e}")
                continue
                
        return "\n".join(results)

    def _build_context(self, chunks: List[Dict], structured_ctx: Dict, sql_results: str = "") -> str:
        """
        Combine document chunks, structured data metadata, and SQL results into context string.

        Args:
            chunks: List of retrieved document chunks
            structured_ctx: Structured data context
            sql_results: Results from executed SQL queries

        Returns:
            Formatted context string for LLM
        """
        logger.debug("Building combined context")

        context = ""

        # Add document excerpts
        if chunks:
            context += "=== RELEVANT DOCUMENT EXCERPTS ===\n\n"
            for idx, chunk in enumerate(chunks, start=1):
                content = chunk.get('content', '')
                similarity = chunk.get('similarity', 0)

                # Truncate very long chunks
                if len(content) > 500:
                    content = content[:500] + "..."

                context += f"[Source {idx}] (Relevance: {similarity:.2f})\n{content}\n\n"

        # Add structured data context
        if structured_ctx['structured_files']:
            context += "\n=== AVAILABLE DATASETS ===\n"
            for ds in structured_ctx['structured_files']:
                filename = ds.get('filename', 'Unknown')
                row_count = ds.get('row_count', 0)
                column_names = ds.get('column_names', [])

                context += f"- **{filename}**: {row_count:,} rows\n"
                context += f"  Columns: {', '.join(column_names[:10])}"  # Limit to first 10 columns
                if len(column_names) > 10:
                    context += f" ... (+{len(column_names) - 10} more)"
                context += "\n"

        # Add extracted tables context
        if structured_ctx['extracted_tables']:
            context += "\n=== EXTRACTED TABLES FROM DOCUMENTS ===\n"
            for tbl in structured_ctx['extracted_tables']:
                page = tbl.get('page_number', '?')
                table_idx = tbl.get('table_index', 0)
                row_count = tbl.get('row_count', 0)
                columns = tbl.get('column_names', [])

                context += f"- Table {table_idx} from page {page}: {row_count} rows\n"
                context += f"  Columns: {', '.join(columns)}\n"

        # Add SQL query results
        if sql_results:
             context += "\n=== STRUCTURED DATA QUERY RESULTS ===\n"
             context += sql_results
             context += "\n"

        logger.debug(f"Built context of {len(context)} characters")
        return context

    def _generate_response(
        self,
        query: str,
        context: str,
        chunks: List[Dict],
        conversation_history: List[Dict] = None
    ) -> str:
        """
        Generate LLM response with context and source citations.

        Args:
            query: User's query
            context: Combined context string
            chunks: Retrieved chunks for citation
            conversation_history: List of previous messages for context

        Returns:
            LLM-generated response with citations
        """
        logger.debug("Generating LLM response")

        try:
            # Build conversation context for response generation
            conversation_context_str = ""
            if conversation_history and len(conversation_history) > 0:
                conversation_context_str = "Recent Conversation:\n"
                for msg in conversation_history[-4:]:  # Last 2 exchanges (4 messages)
                    role = msg.get('role', 'unknown')
                    content = msg.get('content', '')[:150]  # Truncate to 150 chars
                    conversation_context_str += f"{role.capitalize()}: {content}\n"
                conversation_context_str += "\n"

            # Build prompt with context
            prompt = f"""You are a helpful AI assistant. Answer the user's question in a natural, conversational way.

{conversation_context_str}**Available Data:**
{context}

**User Question:** {query}

**Instructions:**
1. Answer directly and confidently based on the data above
2. The data has been PRE-FILTERED according to the user's requirements
3. If the user asked for a specific year, slot, theme, or any filter, the results ONLY include that criteria
4. Present results clearly without adding disclaimers about data filtering or time periods
5. For counting/aggregation questions, provide the numbers and list the relevant items
6. Round all numbers to whole numbers (no decimals)
7. Use natural language: "In 2024, the top 5 themes by GRPs are..." not "Based on available context..."
8. Only express uncertainty if there's genuinely NO relevant data in the results
9. Cite sources using [Source N] only when referencing specific document chunks
10. Be helpful, friendly, and confident - trust the query results

**Your Answer:**"""

            # Generate response using LLM
            response = self.llm.invoke(prompt)

            # Extract content from response
            if hasattr(response, 'content'):
                answer = response.content
            else:
                answer = str(response)

            logger.info(f"Generated response of {len(answer)} characters")
            return answer

        except Exception as e:
            logger.error(f"Error generating LLM response: {e}")
            return f"I encountered an error generating a response: {str(e)}"

    def _expand_query(self, query: str) -> List[str]:
        """
        Generate query variations using LLM paraphrasing.

        This increases retrieval coverage by generating semantic variations
        of the original query.

        Args:
            query: Original user query

        Returns:
            List of query variants: [original_query, paraphrase_1, paraphrase_2]
        """
        logger.debug(f"Expanding query: {query[:50]}...")

        try:
            expansion_prompt = f"""Generate 2 alternative phrasings of this question that preserve the intent but use different words:

Original: {query}

Alternatives (one per line):
"""

            response = self.llm.invoke(expansion_prompt)
            response_text = response.content if hasattr(response, 'content') else str(response)

            # Parse alternatives
            alternatives = [line.strip().strip('12.-') for line in response_text.split('\n')
                          if line.strip() and not line.strip().startswith('Alternative')]

            # Return original + up to 2 alternatives
            result = [query] + alternatives[:2]
            logger.info(f"Expanded query to {len(result)} variants")
            return result

        except Exception as e:
            logger.warning(f"Query expansion failed: {e}. Using original query only.")
            return [query]

    def _rerank_results(self, query: str, chunks: List[Dict], top_k: int = 5) -> List[Dict]:
        """
        Rerank chunks using cross-encoder for better relevance scoring.

        Cross-encoders provide more accurate relevance scores than bi-encoder
        cosine similarity because they process query-chunk pairs directly.

        Args:
            query: Original query
            chunks: Retrieved chunks from vector search
            top_k: Number of top results to return

        Returns:
            List of reranked chunks with rerank_score added
        """
        if not self.reranker or not chunks:
            logger.warning("Reranker not available or no chunks to rerank")
            return chunks[:top_k]

        logger.debug(f"Reranking {len(chunks)} chunks")

        try:
            # Prepare query-chunk pairs
            pairs = [(query, chunk.get('content', '')) for chunk in chunks]

            # Score all pairs
            scores = self.reranker.predict(pairs)

            # Combine chunks with scores and sort
            ranked_chunks = []
            for chunk, score in zip(chunks, scores):
                chunk_copy = chunk.copy()
                chunk_copy['rerank_score'] = float(score)
                ranked_chunks.append(chunk_copy)

            # Sort by rerank score (descending)
            ranked_chunks.sort(key=lambda x: x['rerank_score'], reverse=True)

            logger.info(f"Reranked to top {min(top_k, len(ranked_chunks))} results")
            return ranked_chunks[:top_k]

        except Exception as e:
            logger.error(f"Reranking failed: {e}. Returning original order.")
            return chunks[:top_k]

    def _apply_mmr(self, query_emb: np.ndarray, chunks: List[Dict],
                   lambda_param: float = 0.7, top_k: int = 5) -> List[Dict]:
        """
        Apply Maximal Marginal Relevance for diversity in results.

        MMR = λ * relevance - (1-λ) * max_similarity_to_selected

        This prevents returning multiple nearly-identical chunks.

        Args:
            query_emb: Query embedding vector
            chunks: Candidate chunks (must have 'embedding' field)
            lambda_param: Balance between relevance (1.0) and diversity (0.0)
            top_k: Number of results to select

        Returns:
            List of diverse chunks
        """
        if not chunks or len(chunks) <= top_k:
            return chunks

        logger.debug(f"Applying MMR to {len(chunks)} chunks (lambda={lambda_param})")

        try:
            selected = []
            remaining = chunks.copy()

            # Extract embeddings - need to fetch if not present
            for chunk in remaining:
                if 'embedding' not in chunk:
                    # Generate embedding for this chunk
                    chunk['embedding'] = self.embedding_model.encode([chunk.get('content', '')])[ 0]

            while len(selected) < top_k and remaining:
                if not selected:
                    # First selection: pure relevance
                    similarities = []
                    for chunk in remaining:
                        sim = cosine_similarity([query_emb], [chunk['embedding']])[0][0]
                        similarities.append(sim)
                    best_idx = np.argmax(similarities)
                else:
                    # Subsequent selections: MMR
                    mmr_scores = []
                    selected_embs = np.array([chunk['embedding'] for chunk in selected])

                    for chunk in remaining:
                        chunk_emb = chunk['embedding']

                        # Relevance to query
                        relevance = cosine_similarity([query_emb], [chunk_emb])[0][0]

                        # Max similarity to already selected
                        similarities = cosine_similarity([chunk_emb], selected_embs)[0]
                        max_sim = np.max(similarities)

                        # MMR formula
                        mmr = lambda_param * relevance - (1 - lambda_param) * max_sim
                        mmr_scores.append(mmr)

                    best_idx = np.argmax(mmr_scores)

                # Move best from remaining to selected
                selected.append(remaining.pop(best_idx))

            logger.info(f"MMR selected {len(selected)} diverse results")
            return selected

        except Exception as e:
            logger.error(f"MMR failed: {e}. Returning top_k chunks.")
            return chunks[:top_k]

    def _format_sources(self, chunks: List[Dict]) -> List[Dict]:
        """
        Format chunk sources for frontend display.

        Args:
            chunks: Retrieved chunks

        Returns:
            List of formatted source dicts
        """
        sources = []

        for idx, chunk in enumerate(chunks, start=1):
            source = {
                'number': idx,
                'content': chunk.get('content', '')[:200] + "...",  # Preview
                'similarity': round(chunk.get('similarity', 0), 3),
                'document_id': chunk.get('document_id'),
                'metadata': chunk.get('chunk_metadata', {})
            }
            sources.append(source)

        return sources

    def classify_query_type(self, query: str, confidence_threshold: float = 0.6) -> Dict[str, Any]:
        """
        Semantically classify query type using embedding similarity to exemplars.

        This is more accurate than keyword matching as it understands semantic intent.

        Types:
        - 'rag': Pure document Q&A
        - 'sql': Structured data query
        - 'prediction': Predictive analytics
        - 'hybrid': Combination of multiple types

        Args:
            query: User's query
            confidence_threshold: Minimum similarity score to confidently classify

        Returns:
            Dict with 'type' (str), 'confidence' (float), and 'scores' (dict)
        """
        logger.debug(f"Classifying query type: {query[:50]}...")

        # Define exemplar queries for each category
        exemplars = {
            'rag': [
                "What does document X say about topic Y?",
                "Summarize the key points from the report",
                "What are the main findings in the research paper?",
                "Explain the methodology described in the document",
                "What recommendations are mentioned in the proposal?"
            ],
            'sql': [
                "What is the average value in column X?",
                "How many rows have status completed?",
                "Calculate the total sales by region",
                "Show me the top 10 customers by revenue",
                "Filter the data where amount is greater than 1000"
            ],
            'prediction': [
                "Forecast sales for next quarter",
                "What will the trend be in 6 months?",
                "Predict the peak demand period",
                "What is the probability of exceeding the target?",
                "Project the growth rate for next year"
            ]
        }

        try:
            # Encode query
            query_emb = self.embedding_model.encode([query])[0]

            # Calculate average similarity to exemplars for each category
            category_scores = {}

            for category, category_exemplars in exemplars.items():
                exemplar_embs = self.embedding_model.encode(category_exemplars)
                similarities = cosine_similarity([query_emb], exemplar_embs)[0]
                avg_similarity = float(np.mean(similarities))
                max_similarity = float(np.max(similarities))

                # Use weighted combination: 70% max, 30% avg
                category_scores[category] = 0.7 * max_similarity + 0.3 * avg_similarity

            logger.debug(f"Category scores: {category_scores}")

            # Find best matching category
            best_category = max(category_scores.items(), key=lambda x: x[1])
            category_type = best_category[0]
            confidence = best_category[1]

            # Check if multiple categories have high scores (hybrid query)
            high_score_categories = [cat for cat, score in category_scores.items()
                                    if score >= confidence_threshold]

            if len(high_score_categories) > 1:
                category_type = 'hybrid'
                logger.info(f"Query classified as hybrid (multiple high scores): {high_score_categories}")
            elif confidence < confidence_threshold:
                # Low confidence - default to RAG
                category_type = 'rag'
                logger.info(f"Low confidence ({confidence:.2f}), defaulting to RAG")
            else:
                logger.info(f"Query classified as {category_type} (confidence: {confidence:.2f})")

            return {
                'type': category_type,
                'confidence': confidence,
                'scores': category_scores
            }

        except Exception as e:
            logger.error(f"Error in semantic query classification: {e}. Defaulting to RAG.")
            return {
                'type': 'rag',
                'confidence': 0.0,
                'scores': {},
                'error': str(e)
            }

    def should_generate_visualization(self, query: str, sql_results: str) -> Dict[str, Any]:
        """
        Detect if query needs visualization based on:
        - Explicit requests ("chart", "plot", "graph", "visualize")
        - Statistical queries ("count", "average", "sum", "trend")
        - Comparison queries ("compare", "versus", "top N")
        - SQL results with numeric data

        Args:
            query: User's natural language query
            sql_results: SQL query results string

        Returns:
            {
                'should_visualize': bool,
                'visualization_type': str,  # 'explicit' or 'automatic'
                'suggested_chart': str,      # 'bar', 'line', 'pie', 'auto'
                'sql_data': str              # SQL results for chart generation
            }
        """
        logger.info(f"Checking if visualization needed for query: {query}")

        try:
            # If no SQL results, no visualization
            if not sql_results or len(sql_results.strip()) < 10:
                logger.debug("No SQL results, skipping visualization")
                return {'should_visualize': False}

            query_lower = query.lower()

            # Check for explicit visualization requests
            explicit_keywords = ['chart', 'plot', 'graph', 'visualize', 'visualization',
                                'show me', 'display', 'draw', 'create a', 'generate a']

            is_explicit = any(keyword in query_lower for keyword in explicit_keywords)

            # Check for statistical/aggregation queries (good candidates for charts)
            statistical_keywords = ['count', 'average', 'sum', 'total', 'mean',
                                   'trend', 'over time', 'by year', 'by month',
                                   'by channel', 'by category', 'distribution']

            is_statistical = any(keyword in query_lower for keyword in statistical_keywords)

            # Check for comparison queries
            comparison_keywords = ['compare', 'versus', 'vs', 'top', 'bottom',
                                  'most', 'least', 'highest', 'lowest', 'rank',
                                  'best', 'worst', 'which', 'how many']

            is_comparison = any(keyword in query_lower for keyword in comparison_keywords)

            # Determine if should visualize
            should_viz = is_explicit or is_statistical or is_comparison

            if not should_viz:
                logger.debug("Query doesn't match visualization patterns")
                return {'should_visualize': False}

            # Determine suggested chart type
            suggested_chart = 'auto'

            if 'pie' in query_lower or 'proportion' in query_lower or 'percentage' in query_lower:
                suggested_chart = 'pie'
            elif 'line' in query_lower or 'trend' in query_lower or 'over time' in query_lower:
                suggested_chart = 'line'
            elif 'bar' in query_lower or 'compare' in query_lower or 'count' in query_lower:
                suggested_chart = 'bar'
            elif 'scatter' in query_lower or 'relationship' in query_lower:
                suggested_chart = 'scatter'

            visualization_type = 'explicit' if is_explicit else 'automatic'

            logger.info(f"Visualization needed: {visualization_type}, suggested: {suggested_chart}")

            return {
                'should_visualize': True,
                'visualization_type': visualization_type,
                'suggested_chart': suggested_chart,
                'sql_data': sql_results,
                'query': query
            }

        except Exception as e:
            logger.error(f"Error in visualization detection: {e}")
            return {'should_visualize': False}


class QueryRouter:
    """
    Route queries to appropriate handlers based on query type.

    This class determines whether a query should be handled by:
    - RAG engine (document Q&A)
    - SQL agent (structured data queries)
    - Predictive analyzer (forecasting, analytics)
    - Hybrid approach (combination)
    """

    def __init__(self, rag_engine: KnowledgeBaseRAG):
        self.rag_engine = rag_engine
        logger.info("QueryRouter initialized")

    def route_query(self, kb_id: str, query: str) -> Dict:
        """
        Route query to appropriate handler using semantic classification.

        Args:
            kb_id: Knowledge base ID
            query: User query

        Returns:
            Dict with query_type, confidence, scores, and routing decisions
        """
        classification = self.rag_engine.classify_query_type(query)
        query_type = classification['type']
        logger.info(f"Query classified as: {query_type} (confidence: {classification.get('confidence', 0):.2f})")

        return {
            'query_type': query_type,
            'confidence': classification.get('confidence', 0),
            'scores': classification.get('scores', {}),
            'should_use_rag': query_type in ['rag', 'hybrid'],
            'should_use_sql': query_type in ['sql', 'hybrid'],
            'should_use_prediction': query_type in ['prediction', 'hybrid']
        }


# Utility functions for integration

def get_kb_rag_engine(llm, supabase_client, embedding_model: str = 'sentence-transformers/all-MiniLM-L6-v2'):
    """
    Factory function to create KnowledgeBaseRAG instance.

    Args:
        llm: LangChain LLM instance
        supabase_client: Supabase client
        embedding_model: Embedding model name

    Returns:
        KnowledgeBaseRAG instance
    """
    return KnowledgeBaseRAG(llm, embedding_model, supabase_client)


# Example usage
if __name__ == "__main__":
    # Setup logging for testing
    logging.basicConfig(level=logging.INFO)

    print("KnowledgeBaseRAG module loaded successfully")
    print("Ready for integration with backend/main.py")
