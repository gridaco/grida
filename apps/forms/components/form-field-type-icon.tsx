import { FormInputType } from "@/types";
import {
  EnvelopeClosedIcon,
  TextIcon,
  CalendarIcon,
  GlobeIcon,
  DropdownMenuIcon,
  CheckCircledIcon,
  EyeClosedIcon,
  ColorWheelIcon,
  RadiobuttonIcon,
  SwitchIcon,
  SliderIcon,
  FileTextIcon,
} from "@radix-ui/react-icons";
import {
  CreditCardIcon,
  FileIcon,
  SearchIcon,
  FileAudioIcon,
  FileImageIcon,
  FilePenLineIcon,
  FileVideoIcon,
  KeyRoundIcon,
  MapPinnedIcon,
  HashIcon,
  ClockIcon,
  PhoneIcon,
  BracesIcon,
} from "lucide-react";

export function FormFieldTypeIcon({
  type,
  className,
}: {
  type: FormInputType;
  className?: string;
}) {
  const props = {
    className: className,
  };

  switch (type) {
    case "textarea":
    case "text":
      return <TextIcon {...props} />;
    case "richtext":
      return <FileTypeIcon type={type} {...props} />;
    case "tel":
      return <PhoneIcon {...props} />;
    case "email":
      return <EnvelopeClosedIcon {...props} />;
    case "radio":
    case "toggle":
    case "toggle-group":
      return <RadiobuttonIcon {...props} />;
    case "select":
      return <DropdownMenuIcon {...props} />;
    case "url":
      return <GlobeIcon {...props} />;
    case "checkbox":
    case "checkboxes":
      return <CheckCircledIcon {...props} />;
    case "time":
      return <ClockIcon {...props} />;
    case "date":
    case "datetime-local":
    case "month":
    case "week":
      return <CalendarIcon {...props} />;
    case "password":
      return <KeyRoundIcon {...props} />;
    case "color":
      return <ColorWheelIcon {...props} />;
    case "hidden":
      return <EyeClosedIcon {...props} />;
    case "switch":
      return <SwitchIcon {...props} />;
    case "number":
      return <HashIcon {...props} />;
    case "range":
      return <SliderIcon {...props} />;
    case "image":
    case "audio":
    case "video":
    case "file":
      return <FileTypeIcon type={type} {...props} />;
    case "signature":
      // TODO: replace icon
      return <FilePenLineIcon {...props} />;
    case "payment":
      // TODO: replace icon
      return <CreditCardIcon {...props} />;
    case "search":
      return <SearchIcon {...props} />;
    case "latlng":
      return <MapPinnedIcon {...props} />;
    case "country":
      return <GlobeIcon {...props} />;
    case "json":
      return <BracesIcon {...props} />;
    default:
      return <TextIcon {...props} />;
  }
}

export function FileTypeIcon({
  type,
  className,
}: {
  type: "file" | "image" | "audio" | "video" | "richtext";
  className?: string;
}) {
  const props = {
    className: className,
  };

  switch (type) {
    case "image":
      return <FileImageIcon {...props} />;
    case "audio":
      return <FileAudioIcon {...props} />;
    case "video":
      return <FileVideoIcon {...props} />;
    case "richtext":
      return <FileTextIcon {...props} />;
    case "file":
    default:
      return <FileIcon {...props} />;
  }
}
