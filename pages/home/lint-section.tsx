import { Typography } from "@material-ui/core"
import React from "react"

export default function () {
    return <div className="Section">
        <Typography variant="h1" style={{ color: "#292467" }}>
            <div className="Text-Hightlight-Pink">Lint</div> your design —
            <div className="Text-Hightlight-Pink">Visually</div>, and
            <div className="Text-Hightlight-Pink">Constructively</div>.
        </Typography>
        <Typography variant="h6" style={{ color: "white" }}>
            What you see is not what you get. Clean up your design make it perfect behind the scene.
        </Typography>
    </div>
}