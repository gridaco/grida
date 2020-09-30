import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart';

class TestImagePainter extends CustomPainter {
  final ui.Image image;

  TestImagePainter({this.image});

  @override
  void paint(Canvas canvas, Size size) {
    // draw image
    drawImage(canvas);
  }

  drawImage(Canvas canvas) {
    if (image != null) {
      canvas.drawImage(image, new Offset(0.0, 0.0), new Paint());
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) {
    return true;
  }
}
