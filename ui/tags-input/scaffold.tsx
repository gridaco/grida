import React, { useState, useEffect } from "react";
import { WithContext as ReactTags } from "react-tag-input";

const KeyCodes = {
  comma: 188,
  enter: 13,
};

type Tag = {
  id: string;
  text: string;
};

const delimiters = [KeyCodes.comma, KeyCodes.enter];

export function TagsInput({
  suggestions = [],
  initialTags = [],
  placeholder = "Add a tag...",
  onChange,
  onClick,
  onAdd,
  onDelete,
}: {
  suggestions?: Array<Tag>;
  initialTags?: Array<Tag>;
  placeholder?: string;
  onChange?: (tags: Array<Tag>) => void;
  onClick?: (tag: Tag) => void;
  onAdd?: (tag: Tag) => void;
  onDelete?: (tag: Tag) => void;
}) {
  const [tags, setTags] = React.useState(initialTags);

  useEffect(() => {
    onChange?.(tags);
  }, [tags]);

  const handleDelete = (i) => {
    onDelete?.(tags[i]);
    setTags(tags.filter((tag, index) => index !== i));
  };

  const handleAddition = (tag) => {
    onAdd?.(tag);
    setTags([...tags, tag]);
  };

  const handleDrag = (tag, currPos, newPos) => {
    const newTags = tags.slice();

    newTags.splice(currPos, 1);
    newTags.splice(newPos, 0, tag);

    setTags(newTags);
  };

  const handleTagClick = (index) => {
    onClick?.(tags[index]);
  };

  return (
    <ReactTags
      tags={tags}
      suggestions={suggestions}
      delimiters={delimiters}
      handleDelete={handleDelete}
      handleAddition={handleAddition}
      handleDrag={handleDrag}
      handleTagClick={handleTagClick}
      inputFieldPosition="inline"
      placeholder={placeholder}
      autocomplete
    />
  );
}
