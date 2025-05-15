"use client";

import React, { useCallback, useMemo } from "react";
import { useEditorState } from "@/scaffolds/editor";
import { supported_field_types, annotations } from "@/k/supported_field_types";
import { blocklabels, supported_block_types } from "@/k/supported_block_types";
import type { FormBlockType, FormInputType } from "@/types";
import Fuse from "fuse.js";

/**
 * Hook for managing form block insertion menu state and actions.
 *
 * Provides:
 * - Search functionality for blocks and fields
 * - Filtered lists of available blocks and fields
 * - Actions to add new blocks and fields
 *
 * @returns {Object} Menu state and actions
 * @property {string} search - Current search query
 * @property {function} setSearch - Update search query
 * @property {FormBlockType[]} filtered_block_types - Filtered list of available blocks
 * @property {FormInputType[]} filtered_field_types - Filtered list of available fields
 * @property {function} addBlock - Add a new block
 * @property {function} addFieldBlock - Add a new field block
 */
export default function useInsertFormBlockMenu() {
  const [search, setSearch] = React.useState("");
  const [state, dispatch] = useEditorState();

  const addBlock = useCallback(
    (block: FormBlockType) => {
      dispatch({
        type: "blocks/new",
        block: block,
      });
    },
    [dispatch]
  );

  const addFieldBlock = useCallback(
    (type: FormInputType) => {
      dispatch({
        type: "blocks/new",
        block: "field",
        init: {
          type: type,
        },
      });
    },
    [dispatch]
  );

  const blockFuse = useMemo(() => {
    const blockData = supported_block_types.map((block_type) => ({
      type: block_type,
      label: blocklabels[block_type],
    }));
    return new Fuse(blockData, { keys: ["label"] });
  }, []);

  const fieldFuse = useMemo(() => {
    const fieldData = supported_field_types.map((field_type) => ({
      type: field_type,
      label: annotations[field_type].label,
    }));
    return new Fuse(fieldData, { keys: ["label"] });
  }, []);

  const filtered_block_types = useMemo(() => {
    if (search.trim() === "") {
      return supported_block_types;
    }
    const results = blockFuse.search(search);
    return results.map((result) => result.item.type);
  }, [search, blockFuse]);

  const filtered_field_types = useMemo(() => {
    if (search.trim() === "") {
      return supported_field_types;
    }
    const results = fieldFuse.search(search);
    return results.map((result) => result.item.type);
  }, [search, fieldFuse]);

  return {
    search,
    setSearch,
    filtered_block_types,
    filtered_field_types,
    addBlock,
    addFieldBlock,
  };
}
