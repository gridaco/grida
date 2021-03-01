function groupBy(xs, key) {
    return xs.reduce(function(rv, x) {
        (rv[x[key]] = rv[x[key]] || []).push(x);
        return rv;
    }, {});
};

function importAll(r) {
    const result = r.keys().reduce(function(r, a) {
        const fileName = a.substr(1);
        const root = fileName.split("/")[1];
        r[root] = r[root] || [];
        r[root].push(a);
        return r;
    }, Object.create(null));

    const data = [];
    Object.keys(result).map(i => {
        result[i].map(path => {
            const fileName = path.substr(1);
            data.push({
                fileName: fileName.replace(/\/index\.md$/, ""),
                content: r(path).default
            })
        })
    })

    return data.reduce(function(r, a) {
        const root = a.fileName.split("/")[1] == null ? "index" : a.fileName.split("/")[1];
        r[root] = r[root] || [];
        r[root].push(a);
        return r;
    }, Object.create(null));
}

export const docs = importAll(
    require.context('../../../docs/', true, /\.md$/)
);