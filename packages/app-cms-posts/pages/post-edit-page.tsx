import React from "react";
import Dialog from "@material-ui/core/Dialog";

import { BoringScaffold } from "@grida.co/app/boring-scaffold";
import { PublishPostReviewDialogBody } from "../dialogs";

export default function PostEditPage() {
  const [review, setReview] = React.useState(false);

  return (
    <div>
      <Dialog
        maxWidth="xl"
        open={review}
        onClose={() => {
          setReview(false);
        }}
      >
        <PublishPostReviewDialogBody
          title="Hi"
          onPublish={(p) => {
            // 1. update with value
            // 2. then => publish
            setReview(false);
          }}
          onTitleChange={function (t): void {
            // throw new Error("Function not implemented.");
          }}
          onSummaryChange={function (t): void {
            // throw new Error("Function not implemented.");
          }}
          onSchedule={(p) => {
            // 1. update with value
            // 2. them => schedule
            setReview(false);
          }}
          onCancel={() => {
            setReview(false);
          }}
          onTagsEdit={function (tags: string[]): void {
            // throw new Error("Function not implemented.");
          }}
          publication={{
            name: "Grida",
          }}
        />
      </Dialog>
      <button
        onClick={() => {
          setReview(true);
        }}
      >
        publish
      </button>
      <BoringScaffold />
    </div>
  );
}
