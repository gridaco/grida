// import Lottie from "react-lottie";
import animationData from "public/animations/detection-demos/button/comp.json";

export default function ButtonDetectDemo() {
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
    <div style={{ width: "90%", margin: "50px 20px" }}>
      {/* <Lottie options={defaultMotionOptions} /> */}
    </div>
  );
}
