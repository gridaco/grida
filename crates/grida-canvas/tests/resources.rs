use cg::resources::Resources;

#[test]
fn resources_store_and_retrieve() {
    let mut res = Resources::new();
    let rid = "res://foo";
    let data = vec![1, 2, 3, 4];
    let mem = res.insert(rid, data.clone());
    assert!(mem.starts_with("mem://"));
    assert_eq!(res.get(rid).unwrap(), data);
    let removed = res.remove(rid).unwrap();
    assert_eq!(removed, data);
    assert!(res.get(rid).is_none());
}

#[test]
fn resources_mem_roundtrip() {
    let mut res = Resources::new();
    let data = vec![9, 8, 7];
    let mem = res.create_mem(data.clone());
    let loaded = res.get_mem(&mem).unwrap();
    assert_eq!(loaded, data);
}
