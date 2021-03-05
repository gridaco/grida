import React from 'react'

interface BlankAreaProps {
  height: number
}

export default function BlankArea(props : BlankAreaProps) {
  const { height } = props;
  return (
    <div style={{ height, width: "100%" }} />
  )
}
