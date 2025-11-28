use csscascade::tree::{Tree, WriteOptions};
use std::env;
use std::fs;
use std::io::{self, Read};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    let html = if args.len() > 1 {
        fs::read_to_string(&args[1])?
    } else {
        let mut buffer = String::new();
        io::stdin().read_to_string(&mut buffer)?;
        buffer
    };

    let tree = Tree::from_str(&html)?;
    let verbose = tree.to_string(&WriteOptions::ResolveAllStyle { include_root: true })?;
    println!("{verbose}");
    Ok(())
}
