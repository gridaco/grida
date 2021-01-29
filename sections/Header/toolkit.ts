import { BLOG, GITHUB } from '../../common/toolkit';

interface INavMenu{
  label: string
  href: string
}

export const headerMenu :INavMenu[]= [
  {
    label: 'Reflect',
    href: 'https://reflect.bridged.xyz',
  },
  {
    label: 'Pricing',
    href: 'https://bridged.xyz/pricing',
  },
  {
    label: 'Support',
    href:
      'https://support.bridged.xyz',
  },
];

export const headerSubMenu: INavMenu[] = [
  {
    label: 'Blog',
    href: 'https://medium.com/bridgedxyz',
  },
  {
    label: 'Github',
    href: 'https://github.com/bridgedxyz',
  },
];
