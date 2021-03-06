import React, { useState } from 'react'
import SectionLayout from 'layout/section'
import { Box, Button, Flex } from 'rebass'

const LayoutPage = () => {
  const [align, setAlign] = useState<"start" | "center" | "end">("start");
  const [inherit, setInherit] = useState<boolean>(false);
  return (
    <div>
      <Box height="40px" />
      <Flex alignItems="center" justifyContent="center">
        <h1>Align</h1>
      </Flex>
      <Flex alignItems="center" justifyContent="center">
        <Button onClick={() => setAlign("start")}>START</Button>
        <Button onClick={() => setAlign("center")}>CENTER</Button>
        <Button onClick={() => setAlign("end")}>LEFT</Button>
      </Flex>
      <Box height="40px" />
      <SectionLayout variant="full-width" alignContent={align}>
        <Box height="450px" bg="#000" width="5px" />
      </SectionLayout>
      <Box height="40px" />
      <SectionLayout variant="content-overflow-1" alignContent={align}>
        <Box height="450px" bg="#000" width="5px" />
      </SectionLayout>
      <Box height="40px" />
      <SectionLayout variant="content-default" alignContent={align}>
        <Box height="450px" bg="#000" width="5px" />
      </SectionLayout>
      <Box height="40px" />
      <SectionLayout variant="content-inset-1" alignContent={align}>
        <Box height="450px" bg="#000" width="5px" />
      </SectionLayout>
      <Box height="100px" />
      <Flex alignItems="center" justifyContent="center">
        <h1>Inherit</h1>
      </Flex>
      <Flex alignItems="center" justifyContent="center">
        <Button onClick={() => setInherit(true)}>TRUE</Button>
        <Button onClick={() => setInherit(false)}>FALSE</Button>
      </Flex>
      <Box height="40px" />
      <SectionLayout variant="content-overflow-1" >
        <Box height="450px" bg="#000" width="5px" />
        <SectionLayout variant="full-width" inherit={inherit}>
          <Box height="450px" bg="#000" width="5px" />
        </SectionLayout>
      </SectionLayout>
      <Box height="40px" />
      <SectionLayout variant="content-default" >
        <Box height="450px" bg="#000" width="5px" />
        <SectionLayout variant="content-overflow-1" inherit={inherit}>
          <Box height="450px" bg="#000" width="5px" />
        </SectionLayout>
      </SectionLayout>
      <Box height="40px" />
      <SectionLayout variant="content-inset-1" >
        <Box height="450px" bg="#000" width="5px" />
        <SectionLayout variant="content-default" inherit={inherit}>
          <Box height="450px" bg="#000" width="5px" />
        </SectionLayout>
      </SectionLayout>
    </div>
  )
}

export default LayoutPage
