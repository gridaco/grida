interface IconListProps {
    width: number;
    height: number;
    svg: JSX.Element;
}

export interface IconList {
    search: IconListProps;
    bridged: IconListProps
}

const icons: IconList = {
    search: {
        width: 24,
        height: 24,
        svg: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z" fill="#C1C1C1" />
        </svg>
    },
    bridged: {
        width: 64,
        height: 64,
        svg: <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M40.3016 23.3848L40.207 40.6821L56.9372 57.0342V40.0204V39.7369L56.9348 39.7345C56.7822 30.6788 49.3937 23.3848 40.3016 23.3848Z" fill="black" />
            <path fill-rule="evenodd" clip-rule="evenodd" d="M38.3364 15.3609C30.0295 16.2906 23.5716 23.3374 23.5716 31.8926L23.5716 39.8323L23.8552 57.1296L7.125 40.7775V23.3857V23.2912L7.12526 23.2914C7.17599 14.1472 14.6045 6.75 23.7607 6.75C30.0384 6.75 35.504 10.2273 38.3364 15.3609Z" fill="black" />
        </svg>
    }
};

export default icons;