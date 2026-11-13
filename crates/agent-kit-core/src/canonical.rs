//! Canonical JSON encoding for fingerprints.
//!
//! The encoding is the compact JSON text serde_json produces, with the keys of
//! every object (structs and maps alike) in ascending byte order. Embedded
//! `serde_json::Value` objects keep insertion order in this workspace, so key
//! order is fixed here rather than inherited. Output streams to the writer;
//! only the entries of the object currently being encoded are buffered.

use serde::ser::{self, Serialize};
use std::collections::BTreeMap;
use std::fmt::Display;
use std::io::Write;

#[derive(Debug)]
pub(crate) struct Error;

impl Display for Error {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("canonical encoding failed")
    }
}

impl std::error::Error for Error {}

impl ser::Error for Error {
    fn custom<T: Display>(_: T) -> Self {
        Self
    }
}

type Result<T> = std::result::Result<T, Error>;

/// Write the canonical encoding of `value` to `out`.
pub(crate) fn to_writer<T: Serialize + ?Sized>(out: &mut dyn Write, value: &T) -> Result<()> {
    value.serialize(Canonical { out })
}

fn put(out: &mut dyn Write, bytes: &[u8]) -> Result<()> {
    out.write_all(bytes).map_err(|_| Error)
}

/// A JSON scalar, formatted exactly as serde_json formats it.
fn scalar<T: Serialize + ?Sized>(out: &mut dyn Write, value: &T) -> Result<()> {
    serde_json::to_writer(out, value).map_err(|_| Error)
}

struct Canonical<'a> {
    out: &'a mut dyn Write,
}

/// Object entries keyed by their decoded key. A repeated key keeps its last
/// value, as a JSON object built from the same entries would.
struct Object<'a> {
    out: &'a mut dyn Write,
    entries: BTreeMap<String, Vec<u8>>,
    key: Option<String>,
    /// Closes a `{"Variant":` wrapper opened before the object.
    variant: bool,
}

impl<'a> Object<'a> {
    fn new(out: &'a mut dyn Write, variant: bool) -> Self {
        Self {
            out,
            entries: BTreeMap::new(),
            key: None,
            variant,
        }
    }

    fn entry<T: Serialize + ?Sized>(&mut self, key: String, value: &T) -> Result<()> {
        let mut bytes = Vec::new();
        value.serialize(Canonical { out: &mut bytes })?;
        self.entries.insert(key, bytes);
        Ok(())
    }

    fn finish(self) -> Result<()> {
        put(self.out, b"{")?;
        for (index, (key, value)) in self.entries.iter().enumerate() {
            if index > 0 {
                put(self.out, b",")?;
            }
            scalar(self.out, key.as_str())?;
            put(self.out, b":")?;
            put(self.out, value)?;
        }
        put(self.out, if self.variant { b"}}" } else { b"}" })
    }
}

/// Array elements, written as they arrive.
struct Array<'a> {
    out: &'a mut dyn Write,
    first: bool,
    /// Closes a `{"Variant":` wrapper opened before the array.
    variant: bool,
}

impl Array<'_> {
    fn element<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<()> {
        if !std::mem::replace(&mut self.first, false) {
            put(self.out, b",")?;
        }
        value.serialize(Canonical { out: self.out })
    }

    fn finish(self) -> Result<()> {
        put(self.out, if self.variant { b"]}" } else { b"]" })
    }
}

fn open_variant(out: &mut dyn Write, variant: &str) -> Result<()> {
    put(out, b"{")?;
    scalar(out, variant)?;
    put(out, b":")
}

impl<'a> ser::Serializer for Canonical<'a> {
    type Ok = ();
    type Error = Error;
    type SerializeSeq = Array<'a>;
    type SerializeTuple = Array<'a>;
    type SerializeTupleStruct = Array<'a>;
    type SerializeTupleVariant = Array<'a>;
    type SerializeMap = Object<'a>;
    type SerializeStruct = Object<'a>;
    type SerializeStructVariant = Object<'a>;

    fn serialize_bool(self, value: bool) -> Result<()> {
        put(self.out, if value { b"true" } else { b"false" })
    }
    fn serialize_i8(self, value: i8) -> Result<()> {
        scalar(self.out, &value)
    }
    fn serialize_i16(self, value: i16) -> Result<()> {
        scalar(self.out, &value)
    }
    fn serialize_i32(self, value: i32) -> Result<()> {
        scalar(self.out, &value)
    }
    fn serialize_i64(self, value: i64) -> Result<()> {
        scalar(self.out, &value)
    }
    fn serialize_i128(self, value: i128) -> Result<()> {
        scalar(self.out, &value)
    }
    fn serialize_u8(self, value: u8) -> Result<()> {
        scalar(self.out, &value)
    }
    fn serialize_u16(self, value: u16) -> Result<()> {
        scalar(self.out, &value)
    }
    fn serialize_u32(self, value: u32) -> Result<()> {
        scalar(self.out, &value)
    }
    fn serialize_u64(self, value: u64) -> Result<()> {
        scalar(self.out, &value)
    }
    fn serialize_u128(self, value: u128) -> Result<()> {
        scalar(self.out, &value)
    }
    fn serialize_f32(self, value: f32) -> Result<()> {
        // A JSON number is a double; widen as serde_json's value model does.
        scalar(self.out, &f64::from(value))
    }
    fn serialize_f64(self, value: f64) -> Result<()> {
        scalar(self.out, &value)
    }
    fn serialize_char(self, value: char) -> Result<()> {
        scalar(self.out, &value)
    }
    fn serialize_str(self, value: &str) -> Result<()> {
        scalar(self.out, value)
    }
    fn serialize_bytes(self, value: &[u8]) -> Result<()> {
        let mut array = self.serialize_seq(Some(value.len()))?;
        for byte in value {
            ser::SerializeSeq::serialize_element(&mut array, byte)?;
        }
        ser::SerializeSeq::end(array)
    }
    fn serialize_none(self) -> Result<()> {
        put(self.out, b"null")
    }
    fn serialize_some<T: Serialize + ?Sized>(self, value: &T) -> Result<()> {
        value.serialize(self)
    }
    fn serialize_unit(self) -> Result<()> {
        put(self.out, b"null")
    }
    fn serialize_unit_struct(self, _: &'static str) -> Result<()> {
        put(self.out, b"null")
    }
    fn serialize_unit_variant(self, _: &'static str, _: u32, variant: &'static str) -> Result<()> {
        scalar(self.out, variant)
    }
    fn serialize_newtype_struct<T: Serialize + ?Sized>(
        self,
        _: &'static str,
        value: &T,
    ) -> Result<()> {
        value.serialize(self)
    }
    fn serialize_newtype_variant<T: Serialize + ?Sized>(
        self,
        _: &'static str,
        _: u32,
        variant: &'static str,
        value: &T,
    ) -> Result<()> {
        open_variant(self.out, variant)?;
        value.serialize(Canonical {
            out: &mut *self.out,
        })?;
        put(self.out, b"}")
    }
    fn serialize_seq(self, _: Option<usize>) -> Result<Array<'a>> {
        put(self.out, b"[")?;
        Ok(Array {
            out: self.out,
            first: true,
            variant: false,
        })
    }
    fn serialize_tuple(self, len: usize) -> Result<Array<'a>> {
        self.serialize_seq(Some(len))
    }
    fn serialize_tuple_struct(self, _: &'static str, len: usize) -> Result<Array<'a>> {
        self.serialize_seq(Some(len))
    }
    fn serialize_tuple_variant(
        self,
        _: &'static str,
        _: u32,
        variant: &'static str,
        _: usize,
    ) -> Result<Array<'a>> {
        open_variant(self.out, variant)?;
        put(self.out, b"[")?;
        Ok(Array {
            out: self.out,
            first: true,
            variant: true,
        })
    }
    fn serialize_map(self, _: Option<usize>) -> Result<Object<'a>> {
        Ok(Object::new(self.out, false))
    }
    fn serialize_struct(self, _: &'static str, _: usize) -> Result<Object<'a>> {
        Ok(Object::new(self.out, false))
    }
    fn serialize_struct_variant(
        self,
        _: &'static str,
        _: u32,
        variant: &'static str,
        _: usize,
    ) -> Result<Object<'a>> {
        open_variant(self.out, variant)?;
        Ok(Object::new(self.out, true))
    }
}

impl ser::SerializeSeq for Array<'_> {
    type Ok = ();
    type Error = Error;
    fn serialize_element<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<()> {
        self.element(value)
    }
    fn end(self) -> Result<()> {
        self.finish()
    }
}

impl ser::SerializeTuple for Array<'_> {
    type Ok = ();
    type Error = Error;
    fn serialize_element<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<()> {
        self.element(value)
    }
    fn end(self) -> Result<()> {
        self.finish()
    }
}

impl ser::SerializeTupleStruct for Array<'_> {
    type Ok = ();
    type Error = Error;
    fn serialize_field<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<()> {
        self.element(value)
    }
    fn end(self) -> Result<()> {
        self.finish()
    }
}

impl ser::SerializeTupleVariant for Array<'_> {
    type Ok = ();
    type Error = Error;
    fn serialize_field<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<()> {
        self.element(value)
    }
    fn end(self) -> Result<()> {
        self.finish()
    }
}

impl ser::SerializeMap for Object<'_> {
    type Ok = ();
    type Error = Error;
    fn serialize_key<T: Serialize + ?Sized>(&mut self, key: &T) -> Result<()> {
        self.key = Some(key.serialize(MapKey)?);
        Ok(())
    }
    fn serialize_value<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<()> {
        let key = self.key.take().ok_or(Error)?;
        self.entry(key, value)
    }
    fn end(self) -> Result<()> {
        self.finish()
    }
}

impl ser::SerializeStruct for Object<'_> {
    type Ok = ();
    type Error = Error;
    fn serialize_field<T: Serialize + ?Sized>(
        &mut self,
        key: &'static str,
        value: &T,
    ) -> Result<()> {
        self.entry(key.to_owned(), value)
    }
    fn end(self) -> Result<()> {
        self.finish()
    }
}

impl ser::SerializeStructVariant for Object<'_> {
    type Ok = ();
    type Error = Error;
    fn serialize_field<T: Serialize + ?Sized>(
        &mut self,
        key: &'static str,
        value: &T,
    ) -> Result<()> {
        self.entry(key.to_owned(), value)
    }
    fn end(self) -> Result<()> {
        self.finish()
    }
}

/// A map key as JSON object key text: strings as written, integers, booleans
/// and characters as their decimal or literal text. Other keys are refused.
struct MapKey;

impl ser::Serializer for MapKey {
    type Ok = String;
    type Error = Error;
    type SerializeSeq = ser::Impossible<String, Error>;
    type SerializeTuple = ser::Impossible<String, Error>;
    type SerializeTupleStruct = ser::Impossible<String, Error>;
    type SerializeTupleVariant = ser::Impossible<String, Error>;
    type SerializeMap = ser::Impossible<String, Error>;
    type SerializeStruct = ser::Impossible<String, Error>;
    type SerializeStructVariant = ser::Impossible<String, Error>;

    fn serialize_bool(self, value: bool) -> Result<String> {
        Ok(value.to_string())
    }
    fn serialize_i8(self, value: i8) -> Result<String> {
        Ok(value.to_string())
    }
    fn serialize_i16(self, value: i16) -> Result<String> {
        Ok(value.to_string())
    }
    fn serialize_i32(self, value: i32) -> Result<String> {
        Ok(value.to_string())
    }
    fn serialize_i64(self, value: i64) -> Result<String> {
        Ok(value.to_string())
    }
    fn serialize_i128(self, value: i128) -> Result<String> {
        Ok(value.to_string())
    }
    fn serialize_u8(self, value: u8) -> Result<String> {
        Ok(value.to_string())
    }
    fn serialize_u16(self, value: u16) -> Result<String> {
        Ok(value.to_string())
    }
    fn serialize_u32(self, value: u32) -> Result<String> {
        Ok(value.to_string())
    }
    fn serialize_u64(self, value: u64) -> Result<String> {
        Ok(value.to_string())
    }
    fn serialize_u128(self, value: u128) -> Result<String> {
        Ok(value.to_string())
    }
    fn serialize_f32(self, _: f32) -> Result<String> {
        Err(Error)
    }
    fn serialize_f64(self, _: f64) -> Result<String> {
        Err(Error)
    }
    fn serialize_char(self, value: char) -> Result<String> {
        Ok(value.to_string())
    }
    fn serialize_str(self, value: &str) -> Result<String> {
        Ok(value.to_owned())
    }
    fn serialize_bytes(self, _: &[u8]) -> Result<String> {
        Err(Error)
    }
    fn serialize_none(self) -> Result<String> {
        Err(Error)
    }
    fn serialize_some<T: Serialize + ?Sized>(self, _: &T) -> Result<String> {
        Err(Error)
    }
    fn serialize_unit(self) -> Result<String> {
        Err(Error)
    }
    fn serialize_unit_struct(self, _: &'static str) -> Result<String> {
        Err(Error)
    }
    fn serialize_unit_variant(
        self,
        _: &'static str,
        _: u32,
        variant: &'static str,
    ) -> Result<String> {
        Ok(variant.to_owned())
    }
    fn serialize_newtype_struct<T: Serialize + ?Sized>(
        self,
        _: &'static str,
        value: &T,
    ) -> Result<String> {
        value.serialize(self)
    }
    fn serialize_newtype_variant<T: Serialize + ?Sized>(
        self,
        _: &'static str,
        _: u32,
        _: &'static str,
        _: &T,
    ) -> Result<String> {
        Err(Error)
    }
    fn serialize_seq(self, _: Option<usize>) -> Result<Self::SerializeSeq> {
        Err(Error)
    }
    fn serialize_tuple(self, _: usize) -> Result<Self::SerializeTuple> {
        Err(Error)
    }
    fn serialize_tuple_struct(
        self,
        _: &'static str,
        _: usize,
    ) -> Result<Self::SerializeTupleStruct> {
        Err(Error)
    }
    fn serialize_tuple_variant(
        self,
        _: &'static str,
        _: u32,
        _: &'static str,
        _: usize,
    ) -> Result<Self::SerializeTupleVariant> {
        Err(Error)
    }
    fn serialize_map(self, _: Option<usize>) -> Result<Self::SerializeMap> {
        Err(Error)
    }
    fn serialize_struct(self, _: &'static str, _: usize) -> Result<Self::SerializeStruct> {
        Err(Error)
    }
    fn serialize_struct_variant(
        self,
        _: &'static str,
        _: u32,
        _: &'static str,
        _: usize,
    ) -> Result<Self::SerializeStructVariant> {
        Err(Error)
    }
}
