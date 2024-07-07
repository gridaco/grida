"use client";
import React from "react";
import { ShaderGradientCanvas, ShaderGradient } from "shadergradient";

export default function _02() {
  return (
    <ShaderGradientCanvas
      style={{
        position: "absolute",
        top: 0,
      }}
      // https://github.com/ruucm/shadergradient/issues/87
      onCreated={(_: any) => {
        _.gl.domElement.style.pointerEvents = "none"; // Disable interactions
      }}
    >
      <ShaderGradient
        cPolarAngle={125}
        control="query"
        urlString="https://www.shadergradient.co/customize?animate=on&axesHelper=on&bgColor1=%23000000&bgColor2=%23000000&brightness=1.4&cAzimuthAngle=180&cDistance=5.8&cPolarAngle=95&cameraZoom=1&color1=%23ff8e52&color2=%23ba8fff&color3=%23cdfdcf&destination=onCanvas&embedMode=off&envPreset=dawn&format=gif&fov=45&frameRate=10&grain=off&lightType=3d&pixelDensity=2.3&positionX=0&positionY=0.4&positionZ=0&range=enabled&rangeEnd=40&rangeStart=0&reflection=0.1&rotationX=0&rotationY=0&rotationZ=225&shader=defaults&type=plane&uAmplitude=0&uDensity=0.6&uFrequency=5.5&uSpeed=0.2&uStrength=3.4&uTime=0.2&wireframe=false&"
      />
    </ShaderGradientCanvas>
  );
}
