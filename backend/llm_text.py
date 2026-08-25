"""
Reading text out of a model reply.

Reasoning models -- DeepSeek-R1, QwQ, Qwen3 in thinking mode, and anything
else trained to work out loud -- put their working in the reply itself,
wrapped in <think>...</think>. Some servers strip it before it reaches the
client; Ollama and most OpenAI-compatible endpoints do not.

Nothing downstream expects that. The chart path calls json.loads on the reply
and gets "Expecting value: line 1 column 1"; the read-only SQL guard checks
that the query starts with SELECT and rejects one that starts with <think>;
the routing gate looks for the word DATA and can find whichever of its two
answers the reasoning mentioned first. Prose answers, meanwhile, would show
the user the model talking to itself.

So every reply is read through here, and the working is dropped.
"""

import re

# <think>, <thinking>, <reasoning>, <scratchpad>, and the |channel| form some
# fine-tunes use. Non-greedy, so several blocks in one reply each go.
_BLOCK = re.compile(
    r"<\s*(think|thinking|reasoning|reflection|scratchpad)\s*>.*?<\s*/\s*\1\s*>"
    r"|<\s*\|?\s*(begin_of_thought|thought)\s*\|?\s*>.*?<\s*\|?\s*(end_of_thought|/thought)\s*\|?\s*>",
    re.DOTALL | re.IGNORECASE,
)

# A reply cut off mid-thought never closes the tag. Everything from an unclosed
# opener to the end is working, not answer.
_UNCLOSED = re.compile(
    r"<\s*(think|thinking|reasoning|reflection|scratchpad)\s*>(?!.*?<\s*/\s*\1\s*>).*\Z",
    re.DOTALL | re.IGNORECASE,
)

# The opposite, and the more common one: a closing tag with no opener. Chat
# templates for reasoning models usually prefill the opening tag themselves,
# so the model generates only the closer and the opener never appears in the
# reply at all. Ollama with thinking disabled does exactly this: reasoning
# prose, then a stray </think>, then the answer. Everything up to and
# including that first orphan closer is working, not answer.
_ORPHAN_CLOSE = re.compile(
    r"\A(?:(?!<\s*(?:think|thinking|reasoning|reflection|scratchpad)\s*>).)*?"
    r"<\s*/\s*(?:think|thinking|reasoning|reflection|scratchpad)\s*>",
    re.DOTALL | re.IGNORECASE,
)


def strip_reasoning(text):
    """Remove reasoning blocks from a model reply. Safe on text without any."""
    if not text or "<" not in text:
        return text or ""
    cleaned = _BLOCK.sub("", text)
    cleaned = _ORPHAN_CLOSE.sub("", cleaned)
    cleaned = _UNCLOSED.sub("", cleaned)
    return cleaned.strip()


def content_of(response):
    """
    The usable text of a LangChain reply.

    Handles the list-of-parts shape too: providers that return reasoning as a
    separate content block give a list of dicts rather than a string, and only
    the text parts are wanted.
    """
    raw = getattr(response, "content", response)

    if isinstance(raw, list):
        parts = []
        for part in raw:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict):
                # Skip anything the provider has labelled as thinking.
                if part.get("type") in ("thinking", "reasoning", "redacted_thinking"):
                    continue
                if part.get("type") == "text" or "text" in part:
                    parts.append(part.get("text", ""))
        raw = "".join(parts)

    return strip_reasoning(raw if isinstance(raw, str) else str(raw))
