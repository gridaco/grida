import { FormInputType } from "@/types";
import {
  EnvelopeClosedIcon,
  TextIcon,
  ImageIcon,
  CalendarIcon,
  GlobeIcon,
  DropdownMenuIcon,
  CheckCircledIcon,
  EyeClosedIcon,
  ColorWheelIcon,
  RadiobuttonIcon,
  SwitchIcon,
  SliderIcon,
  FileIcon,
} from "@radix-ui/react-icons";

export function FormFieldTypeIcon({ type }: { type: FormInputType }) {
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
    case "checkboxes":
      return <CheckCircledIcon />;
    case "date":
    case "datetime-local":
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
    case "number":
    case "range":
      return <SliderIcon />;
    case "file":
      return <FileIcon />;
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
