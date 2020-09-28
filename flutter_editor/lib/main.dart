import 'dart:typed_data';
import 'dart:async';
import 'dart:ui' as ui;
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter/painting.dart' show decodeImageFromList;
import 'package:flutter/material.dart';

void main() {
  runApp(MyApp());
}

class MyApp extends StatelessWidget {
  // This widget is the root of your application.
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter Demo',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        primarySwatch: Colors.blue,
        visualDensity: VisualDensity.adaptivePlatformDensity,
      ),
      home: Editor(title: 'Flutter Demo Home Page'),
    );
  }
}

class Editor extends StatefulWidget {
  Editor({Key key, this.title}) : super(key: key);
  final String title;

  @override
  _EditorState createState() => _EditorState();
}

class _EditorState extends State<Editor> {
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

  @override
  Widget build(BuildContext context) {
    // This method is rerun every time setState is called, for instance as done
    // by the _incrementCounter method above.
    //
    // The Flutter framework has been optimized to make rerunning build methods
    // fast, so that you can just rebuild anything that needs updating rather
    // than having to individually change instances of widgets.
    return CustomPaint(
        size: Size.infinite, painter: EditorPainter(image: _image));
  }
}

class EditorPainter extends CustomPainter {
  final ui.Image image;

  EditorPainter({this.image});

  @override
  void paint(Canvas canvas, Size size) {
    // draw image
    drawImage(canvas);

    // draw text
    drawText(canvas);

    // draw rect
    drawRect(canvas);

  }

// gesture detector
//  https://gist.github.com/sma/c6a9111d58c3deb83711106cec6152ee

  drawImage(Canvas canvas) {
    if (image != null) {
      canvas.drawImage(image, new Offset(0.0, 0.0), new Paint());
    }
  }


  drawText(Canvas canvas) {
    TextSpan span = new TextSpan(
        style: new TextStyle(color: Colors.blue[800]), text: "name");
    TextPainter tp = new TextPainter(
        text: span,
        textAlign: TextAlign.left,
        textDirection: TextDirection.ltr);
    tp.layout();
    tp.paint(canvas, new Offset(5.0, 5.0));
  }

  drawRect(Canvas canvas) {
    var paint1 = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;
    //a rectangle
    canvas.drawRect(Offset(100, 100) & Size(375, 793), paint1);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) {
    return true;
  }
}
