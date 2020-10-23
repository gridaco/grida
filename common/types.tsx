import { CSSProperties } from 'react';

export interface CustomButtonTypes {
  icon?: string;
  value: string;
  size?: 'small' | 'medium' | 'large' | undefined;
  color?: 'primary' | 'secondary' | undefined;
  variant?: 'contained' | undefined;
  className?: string;
  href: string;
  type: 'link' | 'default' | 'ghost' | 'primary' | 'dashed' | 'danger';
  block?: boolean;
  style?: CSSProperties;
}

export interface TextTypes {
  algin?: 'inherit' | 'left' | 'center' | 'right' | 'justify';
  color?:
    | 'initial'
    | 'inherit'
    | 'primary'
    | 'secondary'
    | 'textPrimary'
    | 'textSecondary'
    | 'error';
  variant?:
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'h5'
    | 'h6'
    | 'subtitle1'
    | 'subtitle2'
    | 'body1'
    | 'body2'
    | 'caption'
    | 'button'
    | 'overline'
    | 'srOnly'
    | 'inherit';
  className?: string;
  style?: CSSProperties;
  value: any;
}
