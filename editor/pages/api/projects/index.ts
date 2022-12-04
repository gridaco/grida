export default function handler(req, res) {
  res.status(200).json([
    {
      id: "1",
      name: "Project 1",
    },
  ]);
}
