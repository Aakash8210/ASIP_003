# AI Service — Model Files

This directory contains pre-trained model files used by the Phase 13 Computer Vision engine.

## face_detection_yunet_2023mar.onnx

- **Model:** YuNet Face Detector
- **Source:** [opencv/opencv_zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)
- **Version:** 2023mar
- **Size:** ~227 KB
- **License:** MIT
- **Purpose:** Fast, lightweight CPU face detection (CV-SIG-001, CV-SIG-002, CV-SIG-003)

### Download

```bash
curl -L -o ai-service/models/face_detection_yunet_2023mar.onnx \
  "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
```

### Why this model?

- Ships as a 227 KB ONNX file — no large checkpoint download.
- Runs efficiently on CPU; measured ~15–50 ms inference at 640×480.
- Official OpenCV 5 integration via `cv2.FaceDetectorYN`.
- MIT licensed; suitable for commercial use.
- Returns bounding boxes and confidence scores only — no identity embeddings.

