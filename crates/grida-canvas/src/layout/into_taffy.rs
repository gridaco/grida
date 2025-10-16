use crate::cg::types::*;
use taffy::prelude::*;

/// Convert schema Axis to Taffy FlexDirection
impl From<Axis> for FlexDirection {
    fn from(axis: Axis) -> Self {
        match axis {
            Axis::Horizontal => FlexDirection::Row,
            Axis::Vertical => FlexDirection::Column,
        }
    }
}

/// Convert schema LayoutWrap to Taffy FlexWrap
impl From<LayoutWrap> for FlexWrap {
    fn from(wrap: LayoutWrap) -> Self {
        match wrap {
            LayoutWrap::Wrap => FlexWrap::Wrap,
            LayoutWrap::NoWrap => FlexWrap::NoWrap,
        }
    }
}

/// Convert schema MainAxisAlignment to Taffy JustifyContent
impl From<MainAxisAlignment> for JustifyContent {
    fn from(alignment: MainAxisAlignment) -> Self {
        match alignment {
            MainAxisAlignment::Start => JustifyContent::Start,
            MainAxisAlignment::End => JustifyContent::End,
            MainAxisAlignment::Center => JustifyContent::Center,
            MainAxisAlignment::SpaceBetween => JustifyContent::SpaceBetween,
            MainAxisAlignment::SpaceAround => JustifyContent::SpaceAround,
            MainAxisAlignment::SpaceEvenly => JustifyContent::SpaceEvenly,
            MainAxisAlignment::Stretch => JustifyContent::Stretch,
        }
    }
}

/// Convert schema CrossAxisAlignment to Taffy AlignItems
impl From<CrossAxisAlignment> for AlignItems {
    fn from(alignment: CrossAxisAlignment) -> Self {
        match alignment {
            CrossAxisAlignment::Start => AlignItems::Start,
            CrossAxisAlignment::End => AlignItems::End,
            CrossAxisAlignment::Center => AlignItems::Center,
            CrossAxisAlignment::Stretch => AlignItems::Stretch,
        }
    }
}

/// Convert schema EdgeInsets to Taffy Rect<LengthPercentage>
impl From<EdgeInsets> for Rect<LengthPercentage> {
    fn from(insets: EdgeInsets) -> Self {
        Rect {
            left: LengthPercentage::length(insets.left),
            right: LengthPercentage::length(insets.right),
            top: LengthPercentage::length(insets.top),
            bottom: LengthPercentage::length(insets.bottom),
        }
    }
}

/// Convert schema LayoutGap to Taffy Size<LengthPercentage>
/// Note: In Taffy, gap.width is the main axis gap and gap.height is the cross axis gap
impl From<LayoutGap> for Size<LengthPercentage> {
    fn from(gap: LayoutGap) -> Self {
        Size {
            width: LengthPercentage::length(gap.main_axis_gap),
            height: LengthPercentage::length(gap.cross_axis_gap),
        }
    }
}
