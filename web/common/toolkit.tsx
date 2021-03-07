import {
  Hero,
  DesignToCode,
  OnlineApp,
  LayoutDetect,
  Products,
  Collaborate,
  Slogan
} from 'sections/bridged';

export const BridgedSection = [
  { content: () => <Hero key="Hero-section" /> },
  { content: () => <DesignToCode key="DesignToCode-section" /> },
  { content: (isMobile) => <OnlineApp key="OnlineApp-section" isMobile={isMobile} /> },
  { content: () => <LayoutDetect key="LayoutDetect-section" /> },
  { content: () => <Products key="Products-section" /> },
  { content: () => <Collaborate key="Collaborate-section" /> },
  { content: () => <Slogan key="Slogan-section" /> },
];