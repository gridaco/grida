module.exports = {
  name: "currentcolor",
  params: {
    colorToReplace: "#FF00FF", // Default color to replace
  },
  fn: (ast, params, info) => {
    const { colorToReplace } = params;

    const processNode = (node) => {
      if (node.attributes) {
        // Check and replace fill and stroke attributes
        ["fill", "stroke"].forEach((attr) => {
          if (node.attributes[attr] === colorToReplace) {
            // console.log(`Replacing ${attr} color in node ${node.name}`);
            node.attributes[attr] = "currentColor";
          }
        });
      }

      // Process child nodes recursively
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(processNode);
      }
    };

    // Start processing from the root AST node
    processNode(ast);
  },
};
