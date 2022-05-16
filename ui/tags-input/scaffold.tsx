import React, { useState, useEffect } from "react";
import styled from "@emotion/styled";
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
  style,
}: {
  suggestions?: Array<Tag>;
  initialTags?: Array<Tag>;
  placeholder?: string;
  onChange?: (tags: Array<Tag>) => void;
  onClick?: (tag: Tag) => void;
  onAdd?: (tag: Tag) => void;
  onDelete?: (tag: Tag) => void;
  style?: React.CSSProperties;
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
    <StyleRoot style={style}>
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
        // removeComponent={(props) => <RemoveComponent {...props} />}
        autocomplete
      />
    </StyleRoot>
  );
}

const StyleRoot = styled.div`
  .tag-wrapper {
    cursor: pointer !important;
  }

  .ReactTags__tags {
    position: relative;
  }

  /* Styles for the input */
  .ReactTags__tagInput {
    /* width: 200px; */
    outline: none;
    border: none;
    display: inline-block;
    background: transparent;
    input {
      border: none;
      background: transparent;
    }
  }
  .ReactTags__tagInput input.ReactTags__tagInputField,
  .ReactTags__tagInput input.ReactTags__tagInputField:focus {
    margin: 0;
    width: 100%;
    outline: none;
    border: none;
  }

  /* Styles for selected tags */
  .ReactTags__selected {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .ReactTags__selected span.ReactTags__tag {
    background: rgba(0, 0, 0, 0.1);
    color: black;
    display: inline-block;
    padding: 2px 4px;
    border-radius: 4px;
  }

  .ReactTags__selected a.ReactTags__remove {
    color: #aaa;
    margin-left: 4px;
    cursor: pointer;
  }

  /* Styles for suggestions */
  .ReactTags__suggestions {
    position: absolute;
  }

  .ReactTags__suggestions ul {
    list-style-type: none;
    box-shadow: 0.05em 0.01em 0.5em rgba(0, 0, 0, 0.2);
    background: white;
    width: 200px;
  }

  .ReactTags__suggestions li {
    border-bottom: 1px solid #ddd;
    padding: 5px 10px;
    margin: 0;
  }

  .ReactTags__suggestions li mark {
    text-decoration: underline;
    background: none;
    font-weight: 600;
  }

  .ReactTags__suggestions ul li.ReactTags__activeSuggestion {
    background: #b7cfe0;
    cursor: pointer;
  }

  .ReactTags__remove {
    border: none;
    outline: none;
    cursor: pointer;
    background: none;
    color: rgba(0, 0, 0, 0.5);
    :hover {
      color: rgba(0, 0, 0, 0.6);
    }
  }
`;
