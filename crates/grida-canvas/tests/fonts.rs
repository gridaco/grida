#![allow(dead_code)]
/// Embedded font fixtures used in tests and examples.
///
/// - Caveat (Variable)
/// - Bungee Regular
/// - Recursive (Variable)
/// - VT323 Regular
/// - Roboto Flex (Variable)
pub const CAVEAT_VF: &[u8] =
    include_bytes!("../../../fixtures/fonts/Caveat/Caveat-VariableFont_wght.ttf");
pub const BUNGEE_REGULAR: &[u8] =
    include_bytes!("../../../fixtures/fonts/Bungee/Bungee-Regular.ttf");
pub const RECURSIVE_VF: &[u8] = include_bytes!(
    "../../../fixtures/fonts/Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
);
pub const VT323_REGULAR: &[u8] = include_bytes!("../../../fixtures/fonts/VT323/VT323-Regular.ttf");
pub const ROBOTO_FLEX_VF: &[u8] = include_bytes!("../../../fixtures/fonts/Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf");
