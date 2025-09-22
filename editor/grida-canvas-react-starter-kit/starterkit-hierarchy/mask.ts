import grida from "@grida/schema";

/**
 * Visual indicator variants for mask relationships in the hierarchy tree.
 *
 * @example
 * ```typescript
 * // Mask node - the actual masking layer
 * variant: "mask"
 *
 * // Masked layer - any layer that is masked by a mask node
 * variant: "masked"
 * ```
 */
export type MaskIndicatorVariant = "mask" | "masked";

export type NodeMaskRole = "mask" | "masked" | "none";

export interface NodeMaskInfo {
  /** The mask role of this node */
  mask: NodeMaskRole;
  /** The ID of the mask node that this node is masked by (only for masked nodes) */
  mask_id?: grida.program.nodes.NodeID;
  /** The relative index of this node within its mask group (0-based, only for masked nodes) */
  mask_relative_index?: number;
}

export interface MaskComputationContext {
  /**
   * Runtime hierarchy context of the document containing parent/children relations.
   */
  documentCtx:
    | grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext
    | undefined;
  /**
   * Current scene children in stored (rendering) order.
   */
  sceneChildren: readonly grida.program.nodes.NodeID[];
  /**
   * Map of node id to node definition.
   */
  nodes: Record<
    grida.program.nodes.NodeID,
    grida.program.nodes.Node | undefined
  >;
}

/**
 * Computes mask relationships for nodes within the provided context.
 *
 * This function analyzes the hierarchy to identify mask relationships between nodes.
 * It processes nodes in rendering order and groups masked layers that follow each mask node.
 *
 * @param context - The mask computation context containing document hierarchy and node data
 * @returns A map of node IDs to their mask information. Only nodes with mask relationships are included.
 *
 * @example
 * ```typescript
 * const maskMap = computeNodeMaskMap({
 *   documentCtx: hierarchyContext,
 *   sceneChildren: ['node1', 'node2', 'node3', 'node4'],
 *   nodes: { node1: {...}, node2: {...}, ... }
 * });
 *
 * // Result might be:
 * // - node2 (mask node) -> { role: "mask", indicator: "mask" }
 * // - node3 (first masked) -> { role: "masked", maskId: "node2", indicator: "first" }
 * // - node4 (last masked) -> { role: "masked", maskId: "node2", indicator: "last" }
 * ```
 *
 * @remarks
 * - Mask nodes are identified by having a `mask` property with a string value
 * - Masked layers are the nodes that immediately follow a mask node in the hierarchy
 * - The function processes both scene-level children and nested document contexts
 * - Nodes without mask relationships are omitted to keep the result compact
 */
export function computeNodeMaskMap(
  context: MaskComputationContext
): Map<grida.program.nodes.NodeID, NodeMaskInfo> {
  const { documentCtx, nodes, sceneChildren } = context;
  const result = new Map<grida.program.nodes.NodeID, NodeMaskInfo>();

  const processChildren = (
    children: readonly grida.program.nodes.NodeID[] | undefined
  ) => {
    if (!children || children.length === 0) {
      return;
    }

    const maskIndices: number[] = [];

    children.forEach((childId, index) => {
      const node = nodes[childId];
      if (isMaskNode(node)) {
        maskIndices.push(index);
      }
    });

    if (maskIndices.length === 0) {
      return;
    }

    maskIndices.forEach((maskIndex, position) => {
      const maskId = children[maskIndex];
      const previousMaskIndex = position > 0 ? maskIndices[position - 1] : -1;
      const groupStartIndex = previousMaskIndex + 1;
      const groupEndIndex = maskIndex - 1;
      const hasMaskedTargets = groupEndIndex >= groupStartIndex;

      result.set(maskId, {
        mask: "mask",
      });

      if (!hasMaskedTargets) {
        return;
      }

      let relativeIndex = 0;
      for (let index = groupEndIndex; index >= groupStartIndex; index -= 1) {
        const targetId = children[index];
        result.set(targetId, {
          mask: "masked",
          mask_id: maskId,
          mask_relative_index: relativeIndex,
        });
        relativeIndex++;
      }
    });
  };

  processChildren(sceneChildren);

  if (documentCtx) {
    Object.values(documentCtx.__ctx_nid_to_children_ids).forEach(
      processChildren
    );
  }

  return result;
}

function isMaskNode(
  node: grida.program.nodes.Node | undefined
): node is grida.program.nodes.Node & { mask: string } {
  return !!node && typeof (node as { mask?: unknown }).mask === "string";
}
