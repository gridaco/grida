## Contribution

Join slack via link on README, contact maintaners for rapid contribution. otherwise, use github PR feature for general contribution.

## QA List

### Performance

**Device performance check list**

- Mobile (actual mobile hardware)

  - iPhone SE (320px / 2016)
  - iPhone 6/7/8 Plus (414px / 2025)
  - iPhone X (375px / 2018)

- Tablet

  - iPad (768px / 8th generation - 2020)
  - iPad Pro (1024px / 2020)

- Desktop

  - MacBook Pro
  - Any Windows PC bigger than 1080px

### Responsive design check list

**Screen sizes**

- XS
  - 320 (iPhone SE)

### Component checklist

- component on storyboard
- primative component as state indepandent (primative component shall not contain state for itself)
- mdx component compatibility (general components should have in-mdx-usage capabilities)

### Code quality checklist

- no style related constant in jsx (constant such like color and px shall not be inlined in jsx)
- comment design links to visual component files or provide README

## Techniques

**Animations / Motioons**

- [Framer motion](https://framer.com/motion)
- After Effects + BodyMobvin + [Lottie](https://github.com/airbnb/lottie-web) (uses react-lottie as a wrapper)

**Global State Management**

- [RecoilJS](https://recoiljs.org/)

**Reponsive Layout Development**

- [theme-ui](https://theme-ui.com/)

**General UI Development**

- [Reflect React](https://reflect-ui.com)
- [Emotion/styled](https://emotion.sh/docs/styled)

## React coding conventions

**for root components**

- use function as component
- don't use const as component
- don't use React.FC as component
- don't export function as default on end of file explicitly.

```tsx
export default function GeneralComponent(props: {
  title: string;
  desc: string;
}) {
  <div>
    <h1>{props.title}</h1>
    <p>{props.desc}</p>
  </div>;
}
```
