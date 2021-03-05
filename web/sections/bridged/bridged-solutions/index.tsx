import React, { useState, useEffect } from 'react'
import { Flex, Button, Text, Box } from 'rebass';
import styled from '@emotion/styled';
import Link from 'next/link';
import GradientSolutions from './gradient-solutaions';


const SolutionList = [
    {
        title: "idea",
        subTitle: "Instantly create 'idea' from your design",
        desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included."
    },
    {
        title: "code",
        subTitle: "Instantly create 'code' from your design",
        desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included.",
        gradient: "linear-gradient(99.57deg, #6268FF 0%, #9039FF 100%)"
    },
    {
        title: "server",
        subTitle: "Instantly create 'server' from your design",
        desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included."
    },
    {
        title: "translations",
        subTitle: "Instantly create 'translations' from your design",
        desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included."
    },
    {
        title: "insight",
        subTitle: "Instantly create 'insight' from your design",
        desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included."
    },
    {
        title: "everything",
        subTitle: "Instantly create 'everything' from your design",
        desc: "With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included."
    },
]

const BridgedSolutions = () => {
    const [currentSolution, setCurrentSolution] = useState("code");
    const [currentIndex, setCurrentIndex] = useState(1);
    useEffect(() => {
        SolutionList.map((i, ix) => {
            if (i.title === currentSolution) {
                setCurrentIndex(ix)
            }
        })
    }, [currentSolution])

    return (
        <SolutionsWrapper alignItems="center" justifyContent="center" mx="20px">
            <Flex width={["320px", "730px", "985px", "1040px"]} alignItems="center" justifyContent="center" flexDirection="column">
                <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold" mr="auto">Your design is your</Text>
                <GradientSolutions list={SolutionList} currentSolution={currentSolution} changeSolution={title => setCurrentSolution(title)} />

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
            </Flex>
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