import { DownloadUrls } from "@grida/link-downloads";
import { promotion_video_primary_demo_url } from "@grida/link-promotions";
import { SociallUrls } from "@grida/link-social";
function signup_callback_redirect_uri() {
  const LOCAL = "http://localhost:3000/";

  const PRODUCT = "https://www.figma.com/community/plugin/896445082033423994";
  // Todo - the flow shall be as below. above is just temporary.
  // signup > move to console > download plugin > upload design.

  return process.env.NODE_ENV !== "production" ? LOCAL : PRODUCT;
}

function signin_callback_redirect_uri() {
  return "https://grida.co/";
}

export const LandingpageUrls = {
  /**
   * return to home after signin
   * @todo - CHORG reorganize with grida.co
   */
  signin_with_return: `https://accounts.bridged.xyz/signin?redirect_uri=${signin_callback_redirect_uri()}`,

  // todo region swap sign up when ready
  /**
   * return to home after signup
   * @todo - CHORG reorganize with grida.co
   */
  signup_with_return: `https://accounts.bridged.xyz/signup?redirect_uri=${signup_callback_redirect_uri()}`,
  signup: "https://accounts.bridged.xyz/signup",
  // todo endregion swap sign up when ready

  // video
  latest_promotion_video_youtube: promotion_video_primary_demo_url,

  // linked articles
  article_how_do_design_to_code_work: "/docs/concepts/design-to-code",
  article_how_engine_works: "/docs/concepts/detection",

  /**
   * demo
   */
  try_the_demo_1: "https://console.grida.co",
  app: "https://app.grida.co",

  // misc
  privacy_policy: "/docs/support/privacy-policy",
  terms_and_conditions: "/docs/support/terms-and-conditions",
  cookies_policy: "/docs/support/cookies-policy",
};

export const URLS = {
  landing: LandingpageUrls,
  downloads: DownloadUrls,
  social: SociallUrls,
};

export const PRODUCT_LIST = [
  {
    title: "code",
    subTitle: "Instantly create code from your design",
    desc:
      "With powerful Design2Code Engine, Grida generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming conventions and fille/directory structures are supported.",
    gradient: "linear-gradient(99.57deg, #6268FF 0%, #9039FF 100%)",
    type: "video",
    path: require("public/videos/your-design-is-your-code.webm"),
  },
  // {
  // title: "server",
  // subTitle: "Instantly create 'server' from your design",
  // desc: "Manage your contents, Where your ideas are at. Micro-manage your contents. Sometimes you need to go live immediately. With our own logics, sync and manage content directly where your deisgns are at.",
  // gradient: "linear-gradient(99.57deg, #B062FF 0%, #9C39FF 100%)",
  // },
  {
    title: "translations",
    subTitle: "Text management and translations - where your designs are at.",
    desc:
      "Intuitive content management for your app. Translations support is included. No more excel based text managin tools - we all know that just doesn’t work. With Bridged Globalization, translate where your deisgns are at and update your contents with no update time. Go live with a click.",
    gradient: "linear-gradient(99.57deg, #FBA33C 0%, #FFC700 100%)",
    type: "video",
    path: require("public/videos/your-design-is-your-transation.webm"),
  },
  // {
  //     title: "insight",
  //     subTitle: "Instantly create 'insight' from your design",
  //     desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included.",
  //     gradient: "linear-gradient(99.57deg, #6BCBC5 0%, #79E8AC 100%)",
  // },
  {
    title: "git",
    subTitle:
      "Connect your design like a component via git into your existing projects",
    desc:
      "Built-in git support enables you to integrate your design as a pure component into your existing project. Experience all-in-sync workflow. Keep your code synced as a design. Finally, the code generation tool that supports git.",
    gradient: "linear-gradient(99.57deg, #0E1279 0%, #632655 100%)",
    type: "video",
    path: require("public/videos/your-design-is-your-git.webm"),
  },
  //  {
  //     title: "everything",
  //     subTitle: "Instantly create 'everything' from your design",
  //     desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included.",
  //     gradient: "linear-gradient(99.57deg, #9FA3F7 0%, #C49AFA 100%)",
  // },
];
