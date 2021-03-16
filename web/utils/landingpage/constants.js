const MVP_SIGNUP_TYPEFORM_URL =
    'https://woojooj.typeform.com/to/uyTSms5Q';

const LOCAL = "http://localhost:3000/";

const PRODUCT = "https://bridged.xyz/";


export const LandingpageUrls = {
    signin: `https://accounts.bridged.xyz/signin?redirect_uri=${process.env.NODE_ENV !== "production" ? LOCAL : PRODUCT}`,

    // todo region swap sign up when ready
    signup: `https://accounts.bridged.xyz/signup?redirect_uri=${process.env.NODE_ENV !== "production" ? LOCAL : PRODUCT}`,
    // signup: "https://accounts.bridged.xyz/signup",
    // todo endregion swap sign up when ready

    // video
    latest_promotion_video_youtube: "https://www.youtube.com/watch?v=RIZjZFoDhRc&ab_channel=Bridged",

    // linked articles
    article_how_do_design_to_code_work: "/docs/concepts/design-to-code",
    article_how_engine_works: "/docs/concepts/detection",

    // demo
    try_the_demo_1: "https://console.bridged.xyz",

    // misc
    privacy_policy: "/docs/support/privacy-policy",
    terms_and_conditions: "/docs/support/terms-and-conditions",
    cookies_policy: "/docs/support/cookies-policy",
}

const DownloadUrls = {
    download_figma_plugin: "https://www.figma.com/community/plugin/896445082033423994/Bridged",
    download_sketch_plugin: "https://github.com/bridgedxyz/assistant/releases",
    download_xd_plugin: "https://github.com/bridgedxyz/assistant/releases",
    download_vscoode_extension: "https://github.com/bridgedxyz/vscode-extension/",
    download_desktop_app: "https://github.com/bridgedxyz/bridged/releases",
}

const SociallUrls = {
    // social
    youtube: "https://www.youtube.com/channel/UCgJO5apXl_pXRfTxNrkbEBw",
    facebook: "https://facebook.com/bridgedxyz",
    instagram: "https://instagram.com/bridged.xyz",
    twitter: "https://twitter.com/bridgedxyz",
    github: "https://github.com/bridgedxyz",
    dribbble: "https://dribbble.com/bridged",
    medium: "https://medium.com/bridgedxyz",
}

export const URLS = {
    landing: LandingpageUrls,
    downloads: DownloadUrls,
    social: SociallUrls
}

export const PRODUCT_LIST = [{
        title: "code",
        subTitle: "Instantly create code from your design",
        desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming conventions and fille/directory structures are supported.",
        gradient: "linear-gradient(99.57deg, #6268FF 0%, #9039FF 100%)",
        type: "video",
        path: require('public/videos/your-design-is-your-code.mp4')
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
        desc: "Intuitive content management for your app. Translations support is included. No more excel based text managin tools - we all know that just doesn’t work. With Bridged Globalization, translate where your deisgns are at and update your contents with no update time. Go live with a click.",
        gradient: "linear-gradient(99.57deg, #FBA33C 0%, #FFC700 100%)",
        type: "video",
        path: require('public/videos/your-design-is-your-transation.mp4')
    },
    // {
    //     title: "insight",
    //     subTitle: "Instantly create 'insight' from your design",
    //     desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included.",
    //     gradient: "linear-gradient(99.57deg, #6BCBC5 0%, #79E8AC 100%)",
    // },
    {
        title: "git",
        subTitle: "Connect your design like a component via git into your existing projects",
        desc: "Built-in git support enables you to integrate your design as a pure component into your existing project. Experience all-in-sync workflow. Keep your code synced as a design. Finally, the code generation tool that supports git.",
        gradient: "linear-gradient(99.57deg, #0E1279 0%, #632655 100%)",
        type: "video",
        path: require('public/videos/your-design-is-your-git.mp4')
    },
    //  {
    //     title: "everything",
    //     subTitle: "Instantly create 'everything' from your design",
    //     desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included.",
    //     gradient: "linear-gradient(99.57deg, #9FA3F7 0%, #C49AFA 100%)",
    // }, 
]