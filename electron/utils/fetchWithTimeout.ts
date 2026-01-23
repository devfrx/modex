/**
 * Fetch with Timeout Utility
 * 
 * Provides a fetch wrapper with configurable timeout using AbortController.
 * Use this for all network requests to prevent hanging on unresponsive servers.
 */

import { createLogger } from "../services/LoggerService.js";

const log = createLogger("fetchWithTimeout");

/**
 * Fetch with timeout - wraps fetch with AbortController for timeout handling
 * 
 * @param url - URL to fetch
 * @param options - Fetch options (RequestInit)
 * @param timeoutMs - Timeout in milliseconds (default: 30000 = 30 seconds)
 * @returns Promise<Response>
 * @throws Error if timeout or network error occurs
 * 
 * @example
 * const response = await fetchWithTimeout('https://api.example.com/data', {
 *   method: 'GET',
 *   headers: { 'Content-Type': 'application/json' }
 * }, 15000);
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    log.warn("Fetch timeout", { url, timeoutMs });
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch JSON with timeout - fetches and parses JSON response
 * 
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise<T> - Parsed JSON response
 */
export async function fetchJsonWithTimeout<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<T> {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  
  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }
  
  return response.json() as Promise<T>;
}
