import React, { useRef, useState } from "react";
import styled from "@emotion/styled";
import { LoadingButton } from "@editor-ui/button";

interface RemoteSubmitFormProps<T = any> {
  placeholder: string;
  onSubmit: (url: string) => void;
  onSubmitComplete: (url: string, value: T) => void;
  actionName: string;
  loader: (url: string) => Promise<T>;
}

export function RemoteSubmitForm<T = any>(props: RemoteSubmitFormProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [value, setValue] = useState<string>();
  const onKeydown = (e) => {
    if (e.key === "Enter") {
      submit();
      e.preventDefault();
    }
  };

  const onImportClick = () => {
    submit();
  };

  const submit = () => {
    // start loading
    props.loader(value).then((d) => {
      setLoading(false);
      props.onSubmitComplete(value, d);
    });

    // sync
    setLoading(true);
    props.onSubmit(value);
  };

  return (
    <_RootWrapper>
      <Input
        onChange={(e) => {
          setValue(e.target.value);
        }}
        disabled={loading}
        placeholder={props.placeholder}
        ref={inputRef}
        onKeyDown={onKeydown}
      ></Input>
      <LoadingButton loading={loading} onClick={onImportClick}>
        {props.actionName}
      </LoadingButton>
    </_RootWrapper>
  );
}

const Input = styled.input`
  padding-left: 12px;
  padding-right: 12px;
  min-width: 320px;
  border-color: black;
  border-radius: 4px;
  font-size: medium;
  // spacer
  margin-right: 4px;
`;

const _RootWrapper = styled.div`
  display: flex;
  flex-direction: row;
  align-items: stretch;
  align-content: flex-start;
  justify-content: stretch;
`;
