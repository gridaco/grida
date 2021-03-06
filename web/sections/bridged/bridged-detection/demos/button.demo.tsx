import Lottie from "react-lottie";
import animationData from "public/animations/detection-demos/button/comp.json";
export default function ButtonDetectionDemoFrame() {
  const defaultMotionOptions = {
    loop: true,
    autoplay: true,
    isClickToPauseDisabled: true,
    animationData: animationData,
    rendererSettings: {
      preserveAspectRatio: "xMidYMid slice",
    },
  };
  return (
    <div>
      <Lottie options={defaultMotionOptions} />
    </div>
  );
}
