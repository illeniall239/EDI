import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { formula, errorType, cellRef } = body;

    // Validate required fields
    if (!formula || !errorType || !cellRef) {
      console.error('Missing required fields:', { formula, errorType, cellRef });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log('Analyzing formula error:', { formula, errorType, cellRef });

    // Call our backend API - Use port 8000 for Python backend
    const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
    const response = await fetch(`${apiUrl}/analyze-formula`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        formula,
        errorType,
        cellRef,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Backend API error:', errorData);
      throw new Error(errorData.detail || 'Failed to analyze formula error');
    }

    const analysis = await response.json();
    console.log('Received analysis:', analysis);
    return NextResponse.json(analysis);

  } catch (error) {
    console.error('Error in analyze-formula-error route:', error);
    return NextResponse.json(
      { 
        error: 'Failed to analyze formula error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 