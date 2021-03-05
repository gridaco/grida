import React, { useState, useEffect } from 'react'
import { Flex, Button, Text, Box } from 'rebass';
import styled from '@emotion/styled';
import Link from 'next/link';
import GradientSolutions from './gradient-solutaions';


const SolutionList = [
    {
        title: "code",
        subTitle: "Instantly create 'code' from your design",
        desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included.",
        gradient: "linear-gradient(99.57deg, #6268FF 0%, #9039FF 100%)",
        width: [0, 70]
    },
    {
        title: "server",
        subTitle: "Instantly create 'server' from your design",
        desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included.",
        gradient: "linear-gradient(99.57deg, #B062FF 0%, #9C39FF 100%)",
        width: [215, 185]
    },
    {
        title: "translations",
        subTitle: "Instantly create 'translations' from your design",
        desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included.",
        gradient: "linear-gradient(99.57deg, #FBA33C 0%, #FFC700 100%)",
        width: [475, 325]
    },
    {
        title: "insight",
        subTitle: "Instantly create 'insight' from your design",
        desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included.",
        gradient: "linear-gradient(99.57deg, #6BCBC5 0%, #79E8AC 100%)",
        width: [935, 545]
    },
    {
        title: "GIT",
        subTitle: "Instantly create 'GIT' from your design",
        desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included.",
        gradient: "linear-gradient(99.57deg, #0E1279 0%, #632655 100%)",
        width: [1215, 695]
    },
    {
        title: "everything",
        subTitle: "Instantly create 'everything' from your design",
        desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included.",
        gradient: "linear-gradient(99.57deg, #9FA3F7 0%, #C49AFA 100%)",
        width: [1385, 790]
    },
]

const BridgedSolutions = () => {
    const [currentSolution, setCurrentSolution] = useState("code");
    const [currentIndex, setCurrentIndex] = useState(0);
    useEffect(() => {
        SolutionList.map((i, ix) => {
            if (i.title === currentSolution) {
                setCurrentIndex(ix)
            }
        })
    }, [currentSolution])

    return (
        <SolutionsWrapper alignItems="center" justifyContent="center" mx="20px" flexDirection="column">
            <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold" mr="auto">Your design is your</Text>
            <GradientSolutions type="desktop" list={SolutionList} currentSolution={currentSolution} changeSolution={title => setCurrentSolution(title)} />

            <Box width="100%" height="650px" mt="90px" bg="#000" mb="100px" />

            <Text fontSize="18px" fontWeight="bold" mr="auto">{SolutionList[currentIndex].subTitle}</Text>
            <Desc mr="auto">{SolutionList[currentIndex].desc}</Desc>

            <Text fontSize="18px" fontWeight="bold" mr="auto" mt="40px" pb="12px" style={{ borderBottom: "1px solid black" }}>See also</Text>
            <Solutions mr="auto" mt="9px">
                <Link href="/">
                    <span>idea</span>
                </Link>
                <Link href="/">
                    <span>server</span>
                </Link>
                <Link href="/">
                    <span>translations</span>
                </Link>
                <Link href="/">
                    <span>insight</span>
                </Link>
                <Link href="/">
                    <span>everything</span>
                </Link>
            </Solutions>
        </SolutionsWrapper>
    )
}

export default BridgedSolutions

const SolutionsWrapper = styled(Flex)`
    height: 1400px;

     @media (max-width: 767px) {
        height: 1700px;
    }
`

const Desc = styled(Text)`
    max-width: 780px;
    margin-top: 15px;
    font-size: 24px;
    color: #444545;

    @media (max-width: 767px) {
        max-width: 280px;
    }
`

const Solutions = styled(Box)`

    span {
        margin-right: 24px;
        font-size: 18px;
        color: #AEAEAE;
    }

    @media (max-width: 767px) {
        overflow-x: auto;
        width: 100%;
    }

`