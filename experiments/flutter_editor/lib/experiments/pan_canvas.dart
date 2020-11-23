import 'package:flutter/material.dart';
import 'dart:ui' as ui;
import 'dart:typed_data';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter/painting.dart' show decodeImageFromList;

void main() => runApp(MyApp());

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Draggable Custom Painter',
      home: Scaffold(
        body: CustomPainterDraggable(),
      ),
    );
  }
}

class CustomPainterDraggable extends StatefulWidget {
  @override
  _CustomPainterDraggableState createState() => _CustomPainterDraggableState();
}

class _CustomPainterDraggableState extends State<CustomPainterDraggable> {
  var xPos = 0.0;
  var yPos = 0.0;
  final width = 100.0;
  final height = 100.0;
  bool _dragging = false;

  ui.Image _image;

  @override
  void initState() {
    super.initState();
    _loadImage();
  }

  _loadImage() async {
    ByteData bd = await rootBundle
        .load("assets/examples/serjan-midili-FoByTePhmA8-unsplash.jpg");

    final Uint8List bytes = Uint8List.view(bd.buffer);

    final ui.Codec codec = await ui.instantiateImageCodec(bytes);

    final ui.Image image = (await codec.getNextFrame()).image;

    setState(() => _image = image);
  }

  /// Is the point (x, y) inside the rect?
  bool _insideRect(double x, double y) =>
      x >= xPos && x <= xPos + width && y >= yPos && y <= yPos + height;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onPanStart: (details) => _dragging = _insideRect(
        details.globalPosition.dx,
        details.globalPosition.dy,
      ),
      onPanEnd: (details) {
        _dragging = false;
      },
      onPanUpdate: (details) {
        if (_dragging) {
          setState(() {
            xPos += details.delta.dx;
            yPos += details.delta.dy;
          });
        }
      },
      child: Container(
        color: Colors.white,
        child: CustomPaint(
          painter: RectanglePainter(
              rect: Rect.fromLTWH(xPos, yPos, width, height), image: _image),
          child: Container(),
          isComplex: true,
            willChange: true,
        ),
      ),
    );
  }
}

class RectanglePainter extends CustomPainter {
  RectanglePainter({this.image, this.rect});

  final Rect rect;
  final ui.Image image;

  @override
  void paint(Canvas canvas, Size size) {
    drawImage(canvas);
    canvas.drawRect(rect, Paint());
  }

  drawImage(Canvas canvas) {
    if (image != null) {
      for (var i = 0; i < 100; i ++){
        canvas.drawImage(image, new Offset(0.0, 0.0), new Paint());
      }
    }
  }

  @override
  bool shouldRepaint(CustomPainter oldDelegate) => true;
}
