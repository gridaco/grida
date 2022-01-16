import React from "react";
import { ComponentStory, ComponentMeta } from "@storybook/react";

import { ScalingContent, ScalingContentProps } from "./index";

export default {
  title: "Previwe/Scaling",
  component: ScalingContent,
  // More on argTypes: https://storybook.js.org/docs/react/api/argtypes
  argTypes: {
    // backgroundColor: { control: "color" },
  },
} as ComponentMeta<typeof ScalingContent>;

const Template: ComponentStory<typeof ScalingContent> = (args) => (
  <ScalingContent {...args} />
);

export const Default = Template.bind({});
Default.args = {
  type: "scaling",
  data: "<div>Hello World!</br>I'm raw html content inside scaling preview. set maxScale to 1 if you want to limit my max size</div>",
  id: "demo",
  maxScale: "auto",
  origin_size: {
    width: 1080,
    height: 900,
  },
  boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.5)",
} as ScalingContentProps;
