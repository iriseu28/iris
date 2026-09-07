export function createDomainError(message, statusCode, publicMessage) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.publicMessage = publicMessage
  return error
}