"use client";
import React from "react";
import { ShaderGradientCanvas, ShaderGradient } from "shadergradient";

export default function _94() {
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
        control="query"
        urlString="https://www.shadergradient.co/customize?animate=on&axesHelper=on&bgColor1=%23000000&bgColor2=%23000000&brightness=1.2&cAzimuthAngle=180&cDistance=17.4&cPolarAngle=95&cameraZoom=18&color1=%2367b3df&color2=%23a3ffb1&color3=%236b69f9&destination=onCanvas&embedMode=off&envPreset=city&format=gif&fov=50&frameRate=10&grain=on&lightType=env&pixelDensity=2.5&positionX=-0.2&positionY=-0.2&positionZ=0&range=enabled&rangeEnd=40&rangeStart=5.1&reflection=0.1&rotationX=0&rotationY=0&rotationZ=45&shader=defaults&type=sphere&uAmplitude=3.1&uDensity=0.4&uFrequency=5.5&uSpeed=0.2&uStrength=0.2&uTime=5.1&wireframe=false"
      />
    </ShaderGradientCanvas>
  );
}
