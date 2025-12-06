#!/usr/bin/env swift

// https://gist.github.com/softmarshmallow/1095f9d54b84b6196a399a6a8eb0fe9f
// > swift dump-pasteboard.swift
import AppKit

let pb = NSPasteboard.general

for (i, item) in (pb.pasteboardItems ?? []).enumerated() {
    print("=== Item \(i) ===")

    for type in item.types {
        print("UTI:", type.rawValue)

        guard let data = item.data(forType: type) else {
            print("  <no data>")
            continue
        }

        if let string = String(data: data, encoding: .utf8) {
            print("  UTF8 String:")
            print(string)
        } else {
            print("  <non-utf8 data, length \(data.count)>")
        }

        print()
    }
}