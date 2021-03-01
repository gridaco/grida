import { Sitemap } from 'components/footer/sitemap'
import Link from 'next/link';
import React from 'react'
import { Flex, Text } from 'rebass';

interface SitemapListProps {
    sitemap: Sitemap
}

const SitemapList: React.FC<SitemapListProps> = ({ sitemap }) => {
    const { label, href, child } = sitemap;

    return (
        <Flex flexDirection="column">
            <Link href={href}>
                <Text fontWeight="500" fontSize="18px" mb="40px">{label}</Text>
            </Link>
            {
                child.map(i =>
                    <Link href={i.href} key={i.label}>
                        <Text fontSize="14px" mb="15px" color="#292929">{i.label}</Text>
                    </Link>
                )
            }
        </Flex >
    )
}

export default SitemapList