OREO two-face print-reveal assets (v10)

Purpose
-------
Recreates the reference effect where information is printed from top to bottom
onto two adjacent faces of the stationary transparent package.

Files
-----
info_front.png          1024 x 2048 RGBA; main visible information face
info_side.png            512 x 2048 RGBA; right narrow information face
scan_band_front.png     1024 x  256 RGBA; luminous front scan band
scan_band_side.png       512 x  256 RGBA; luminous side scan band
material_preview.png    1536 x 2048 preview on dark background
editable/*.svg          editable vector sources
front_strips/*.png      16 optional pre-cut 1024 x 128 strips
side_strips/*.png       16 optional pre-cut  512 x 128 strips

Blender dimensions used by blender_add_print_reveal_frames_v10.py
----------------------------------------------------------------
Transparent box centre X: +0.099 m
Front information plane: width 0.086 m, height 0.170 m, Y=-0.02315 m
Right information plane: depth 0.042 m, height 0.170 m,
                         X=+0.14665 m
Scan animation: F96-F112, local Z 0.175 m -> 0.005 m

The text is clean reference artwork for the AR animation, not official
production packaging copy. Replace text inside editable SVG files if approved
brand/legal content is available; keep the same canvas dimensions.
