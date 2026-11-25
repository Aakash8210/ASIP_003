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

/**
 * Phase 23: Analyzes audio telemetry via the AI Service.
 *
 * @param {string} interviewId - The interview session identifier.
 * @param {object} audioPayload - Audio parameters and optional samples.
 * @param {object} options - Fetch options.
 * @returns {Promise<object>} AudioObservationResult.
 */
export async function analyzeAudio(interviewId, audioPayload = {}, { timeoutMs = 10000 } = {}) {
  if (!interviewId || typeof interviewId !== 'string') {
    throw new AppError('interviewId is required and must be a string', 400);
  }

  const baseUrl = getAiServiceUrl();
  const url = `${baseUrl}/analysis/audio`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        interview_id: interviewId,
        ...audioPayload,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const errorJson = await response.json();
        if (errorJson?.detail) {
          detail = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail);
        }
      } catch {
        // Fall back
      }
      const statusCode = response.status >= 500 ? 502 : response.status;
      throw new AppError(`AI Service audio analysis failed (${response.status}): ${detail}`, statusCode);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new AppError(`AI Service timed out after ${timeoutMs}ms analyzing audio for interview ${interviewId}`, 504);
    }
    throw new AppError(`Failed to connect to AI Service at ${baseUrl}: ${error.message}`, 502);
  }
}

/**
 * Phase 23: Analyzes interview transcript via the AI Service.
 *
 * @param {string} interviewId - The interview session identifier.
 * @param {object} transcriptPayload - Transcript text, segments, or prompt.
 * @param {object} options - Fetch options.
 * @returns {Promise<object>} TranscriptNLPResult.
 */
export async function analyzeTranscript(interviewId, transcriptPayload = {}, { timeoutMs = 10000 } = {}) {
  if (!interviewId || typeof interviewId !== 'string') {
    throw new AppError('interviewId is required and must be a string', 400);
  }

  const baseUrl = getAiServiceUrl();
  const url = `${baseUrl}/analysis/transcript`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        interview_id: interviewId,
        ...transcriptPayload,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const errorJson = await response.json();
        if (errorJson?.detail) {
          detail = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail);
        }
      } catch {
        // Fall back
      }
      const statusCode = response.status >= 500 ? 502 : response.status;
      throw new AppError(`AI Service transcript analysis failed (${response.status}): ${detail}`, statusCode);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new AppError(`AI Service timed out after ${timeoutMs}ms analyzing transcript for interview ${interviewId}`, 504);
    }
    throw new AppError(`Failed to connect to AI Service at ${baseUrl}: ${error.message}`, 502);
  }
}

/**
 * Phase 23: Executes multimodal fusion via the AI Service.
 *
 * @param {string} interviewId - The interview session identifier.
 * @param {object} fusionPayload - Visual signals, audio result, and transcript result.
 * @param {object} options - Fetch options.
 * @returns {Promise<object>} MultimodalFusionResult.
 */
export async function analyzeMultimodal(interviewId, fusionPayload = {}, { timeoutMs = 10000 } = {}) {
  if (!interviewId || typeof interviewId !== 'string') {
    throw new AppError('interviewId is required and must be a string', 400);
  }

  const baseUrl = getAiServiceUrl();
  const url = `${baseUrl}/analysis/multimodal`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        interview_id: interviewId,
        ...fusionPayload,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const errorJson = await response.json();
        if (errorJson?.detail) {
          detail = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail);
        }
      } catch {
        // Fall back
      }
      const statusCode = response.status >= 500 ? 502 : response.status;
      throw new AppError(`AI Service multimodal fusion failed (${response.status}): ${detail}`, statusCode);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new AppError(`AI Service timed out after ${timeoutMs}ms fusing multimodal signals for interview ${interviewId}`, 504);
    }
    throw new AppError(`Failed to connect to AI Service at ${baseUrl}: ${error.message}`, 502);
  }
}


