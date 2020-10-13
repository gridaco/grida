import 'package:flutter/material.dart';

void main() => runApp(MyApp());

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Draggable Custom Painter',
      home: Scaffold(
        body: AppBody(),
      ),
    );
  }
}

class AppBody extends StatelessWidget{
  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: Art(
        artBoard: ArtBoardNode(
          width: 100,
          height: 500,
          position: Offset(10, 24)
        )
      ),
    );
  }
}

abstract class Node{
  Node({this.width, this.height});
  double width;
  double height;
}

class LineNode extends Node{
  LineNode({this.start, this.end});
  Offset start;
  Offset end;
}

class ArtBoardNode extends Node{
  ArtBoardNode({this.position, double width, double height}): super(width: width, height: height);
  Offset position;
}

class Art extends CustomPainter{
  Art({this.artBoard});

  ArtBoardNode artBoard;
  @override
  void paint(Canvas canvas, Size size) {
    drawArtBoard(artBoard, canvas);
    canvas.drawLine(Offset(0, 0), Offset(100, 100), Paint()..color=Colors.black);
  }

  drawArtBoard(ArtBoardNode artBoard, Canvas canvas){
    final paint = Paint()..color = Colors.grey;
    canvas.drawRect(Rect.fromLTWH(artBoard.position.dx, artBoard.position.dy, artBoard.width, artBoard.height), paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) {
    return true;
  }

}