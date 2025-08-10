import { streamText } from 'ai'

export async function GET() {
  console.log('Starting GET request processing...');
  
  const result = await streamText({
    model: 'ollama/llama3',
    prompt: 'What is the history of the San Francisco Mission-style burrito?'
  })
  
  console.log('Streaming results:', result);
  console.log('About to return response...');
  
  return result.toTextStreamResponse()
}