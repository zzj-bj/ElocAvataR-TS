import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { associateHands, type MotionFrame } from './motion.ts';

export class MotionTracker {
  private constructor(private pose: PoseLandmarker, private hands: HandLandmarker) {}

  static async create(): Promise<MotionTracker> {
    const base = import.meta.env.BASE_URL;
    const vision = await FilesetResolver.forVisionTasks(`${base}wasm`);
    let pose: PoseLandmarker | undefined;
    try {
      // CPU also works on machines with limited WebGL contexts. Rendering remains WebGL.
      pose = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `${base}models/pose_landmarker_full.task`, delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5, outputSegmentationMasks: false,
      });
      const hands = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `${base}models/hand_landmarker.task`, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      return new MotionTracker(pose, hands);
    } catch (error) {
      pose?.close();
      throw error;
    }
  }

  process(video: HTMLVideoElement, timestamp: number): MotionFrame {
    const pose = this.pose.detectForVideo(video, timestamp);
    const hands = this.hands.detectForVideo(video, timestamp);
    const image = pose.landmarks[0] ?? [];
    return {
      timestamp, pose: image, world: pose.worldLandmarks[0] ?? [],
      hands: associateHands(image, hands.landmarks, hands.worldLandmarks),
    };
  }

  close(): void {
    this.pose.close();
    this.hands.close();
  }
}
