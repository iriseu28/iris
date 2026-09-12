const DEFAULT_GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile'

function providerError(publicMessage, statusCode, cause) {
  const error = new Error(publicMessage, { cause })
  error.publicMessage = publicMessage
  error.statusCode = statusCode
  return error
}

export function createAiProvider(environment = process.env) {
  const apiUrl = environment.GROQ_API_URL || DEFAULT_GROQ_URL
  const model = environment.GROQ_MODEL || DEFAULT_GROQ_MODEL

  async function complete(messages) {
    if (!environment.GROQ_API_KEY) {
      throw providerError(
        'Iris’s AI service is not configured yet. Add GROQ_API_KEY and try again.',
        503,
      )
    }

    let response
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${environment.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
        }),
      })
    } catch (error) {
      throw providerError(
        'Iris could not reach its AI service. Please try again.',
        502,
        error,
      )
    }

    let data
    try {
      data = await response.json()
    } catch (error) {
      throw providerError(
        'Iris received an invalid response from its AI service.',
        502,
        error,
      )
    }

    if (!response.ok) {
      console.error('Groq request failed', {
        status: response.status,
        providerMessage: data?.error?.message,
      })
      throw providerError(
        'Iris could not complete that AI request. Please try again.',
        502,
      )
    }

    const content = data?.choices?.[0]?.message?.content
    if (!content) {
      throw providerError(
        'Iris received an empty response from its AI service.',
        502,
      )
    }

    return content
  }

  return {
    interpret: complete,
    plan: complete,
  }
}
