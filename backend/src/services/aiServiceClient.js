import { AppError } from '../middleware/errorHandler.js';

/**
 * Returns the base URL for the FastAPI AI Service.
 */
export function getAiServiceUrl() {
  return process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
}

/**
 * Fetches the current accumulated behaviour analysis for an active interview session from the AI service.
 *
 * @param {string} interviewId - The interview session identifier.
 * @param {object} options - Optional fetch configuration (e.g. timeoutMs).
 * @returns {Promise<object>} The BehaviourAnalysisResult from the AI service.
 */
export async function fetchSessionBehaviour(interviewId, { timeoutMs = 5000 } = {}) {
  if (!interviewId || typeof interviewId !== 'string') {
    throw new AppError('interviewId is required and must be a string', 400);
  }

  const baseUrl = getAiServiceUrl();
  const url = `${baseUrl}/analysis/behaviour/${encodeURIComponent(interviewId)}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const errorJson = await response.json();
        if (errorJson && errorJson.detail) {
          detail = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail);
        }
      } catch {
        // Fall back to status text
      }
      const statusCode = response.status >= 500 ? 502 : response.status;
      throw new AppError(`AI Service behaviour retrieval failed (${response.status}): ${detail}`, statusCode);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new AppError(`AI Service timed out after ${timeoutMs}ms while retrieving behaviour for interview ${interviewId}`, 504);
    }
    throw new AppError(`Failed to connect to AI Service at ${baseUrl}: ${error.message}`, 502);
  }
}

/**
 * Posts a batch of CV frame observations to the AI service for behaviour signal extraction.
 *
 * @param {string} interviewId - The interview session identifier.
 * @param {Array<object>} observations - Array of Phase 13 CVAnalysisResult frame observations.
 * @param {boolean} trackSession - Whether to accumulate observations into the session tracker.
 * @param {object} options - Optional fetch configuration.
 * @returns {Promise<object>} The extracted BehaviourAnalysisResult.
 */
export async function postBatchBehaviour(interviewId, observations = [], trackSession = true, { timeoutMs = 10000 } = {}) {
  if (!interviewId || typeof interviewId !== 'string') {
    throw new AppError('interviewId is required and must be a string', 400);
  }
  if (!Array.isArray(observations)) {
    throw new AppError('observations must be an array', 400);
  }

  const baseUrl = getAiServiceUrl();
  const url = `${baseUrl}/analysis/behaviour`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        interview_id: interviewId,
        observations,
        track_session: trackSession,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const errorJson = await response.json();
        if (errorJson && errorJson.detail) {
          detail = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail);
        }
      } catch {
        // Fall back to status text
      }
      const statusCode = response.status >= 500 ? 502 : response.status;
      throw new AppError(`AI Service behaviour analysis failed (${response.status}): ${detail}`, statusCode);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new AppError(`AI Service timed out after ${timeoutMs}ms analyzing behaviour for interview ${interviewId}`, 504);
    }
    throw new AppError(`Failed to connect to AI Service at ${baseUrl}: ${error.message}`, 502);
  }
}

/**
 * Evicts session state from the AI service in-memory tracker.
 *
 * @param {string} interviewId - The interview session identifier.
 * @returns {Promise<object>} The clearance confirmation.
 */
export async function clearSessionBehaviour(interviewId, { timeoutMs = 5000 } = {}) {
  if (!interviewId || typeof interviewId !== 'string') {
    throw new AppError('interviewId is required and must be a string', 400);
  }

  const baseUrl = getAiServiceUrl();
  const url = `${baseUrl}/analysis/behaviour/${encodeURIComponent(interviewId)}`;

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const errorJson = await response.json();
        if (errorJson && errorJson.detail) {
          detail = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail);
        }
      } catch {
        // Fall back
      }
      const statusCode = response.status >= 500 ? 502 : response.status;
      throw new AppError(`AI Service session clear failed (${response.status}): ${detail}`, statusCode);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Failed to communicate with AI Service: ${error.message}`, 502);
  }
}

