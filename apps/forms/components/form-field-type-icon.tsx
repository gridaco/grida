import { FormFieldType } from "@/types";
import {
  PlusIcon,
  ChevronDownIcon,
  EnvelopeClosedIcon,
  TextIcon,
  ImageIcon,
  EnterFullScreenIcon,
  CalendarIcon,
  Link2Icon,
  Pencil1Icon,
  TrashIcon,
  GlobeIcon,
  DropdownMenuIcon,
  CheckCircledIcon,
  EyeClosedIcon,
  ColorWheelIcon,
  AvatarIcon,
  RadiobuttonIcon,
  ArrowRightIcon,
  SwitchIcon,
} from "@radix-ui/react-icons";

export function FormFieldTypeIcon({ type }: { type: FormFieldType }) {
  switch (type) {
    case "text":
      return <TextIcon />;
    case "tel":
    case "email":
      return <EnvelopeClosedIcon />;
    case "radio":
      return <RadiobuttonIcon />;
    case "select":
      return <DropdownMenuIcon />;
    case "url":
      return <GlobeIcon />;
    case "image":
      return <ImageIcon />;
    case "checkbox":
      return <CheckCircledIcon />;
    case "date":
    case "month":
    case "week":
      return <CalendarIcon />;
    case "password":
      return <EyeClosedIcon />;
    case "color":
      return <ColorWheelIcon />;
    case "hidden":
      return <EyeClosedIcon />;
    case "switch":
      return <SwitchIcon />;
    case "signature":
      // TODO: replace icon
      return <>✍️</>;
    case "payment":
      // TODO: replace icon
      return <>💰</>;
    default:
      return <TextIcon />;
  }
}
