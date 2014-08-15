/*
*  Copyright 2014 TWO SIGMA OPEN SOURCE, LLC
*
*  Licensed under the Apache License, Version 2.0 (the "License");
*  you may not use this file except in compliance with the License.
*  You may obtain a copy of the License at
*
*         http://www.apache.org/licenses/LICENSE-2.0
*
*  Unless required by applicable law or agreed to in writing, software
*  distributed under the License is distributed on an "AS IS" BASIS,
*  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
*  See the License for the specific language governing permissions and
*  limitations under the License.
*/

(function() {
  'use strict';
  var retfunc = function(plotUtils, PlotSampler, PlotLine) {
    var PlotLineLOD = function(data){
      $.extend(true, this, data); // copy properties to itself
      this.type = "sample"; // samples, or aggregations (boxplot)
      this.format();

      this.lodthresh = 200;
      var datacopy = {};
      $.extend(true, datacopy, data);
      datacopy.id = data.id + "f";
      this.line = new PlotLine(datacopy);
      this.lodon = false;
    };

    PlotLineLOD.prototype.render = function(scope){
      if (this.shown === false) {
        if (this.lodon === true) {
          this.clear(scope);
        } else {
          this.line.clear(scope);
        }
        return;
      }

      this.filter(scope);

      var lod = false;
      if (this.vlength > this.lodthresh) {
        lod = true;
      }
      if (this.lodon != lod) {
        if (this.lodon === true) {
          this.clear(scope);
        } else {
          this.line.clear(scope);
        }
        this.lodon = lod;
      }

      if (this.lodon === false) {
        this.line.render(scope);
      } else {
        this.prepare(scope);
        this.clear(scope);
        this.draw(scope);
      }
    };

    PlotLineLOD.prototype.getRange = function() {
      var eles = this.elements;
      var range = {
        xl : 1E100,
        xr : -1E100,
        yl : 1E100,
        yr : -1E100
      };
      for (var i = 0; i < eles.length; i++) {
        var ele = eles[i];
        range.xl = Math.min(range.xl, ele.x);
        range.xr = Math.max(range.xr, ele.x);
        range.yl = Math.min(range.yl, ele.y);
        range.yr = Math.max(range.yr, ele.y);
      }
      return range;
    };

    PlotLineLOD.prototype.applyAxis = function(xAxis, yAxis) {
      this.xAxis = xAxis;
      this.yAxis = yAxis;
      for (var i = 0; i < this.elements.length; i++) {
        var ele = this.elements[i];
        ele.x = xAxis.getPercent(ele.x);
        ele.y = yAxis.getPercent(ele.y);
      }
      // createTips is not called because LOD tips are changing
      // sampler is created after coordinate axis remapping
      this.createSampler();
      this.line.applyAxis(xAxis, yAxis);
    };

    PlotLineLOD.prototype.createSampler = function() {
      var xs = [], ys = [];
      for (var i = 0; i < this.elements.length; i++) {
        var ele = this.elements[i];
        xs.push(ele.x);
        ys.push(ele.y);
      }
      this.sampler = new PlotSampler(xs, ys);
    };

    PlotLineLOD.prototype.format = function() {
      this.itemProps = {
        "id" : this.id,
        "class" : "plot-line",
        "stroke" : this.color,
        "stroke_opacity" : this.color_opacity,
        "stroke_width" : this.width,
        "stroke_dasharray" : this.stroke_dasharray,
        "d" : ""
      };
      this.elementProps = [];
      this.resppipe = [];
    };

    PlotLineLOD.prototype.filter = function(scope) {
      var eles = this.elements;
      var l = plotUtils.upper_bound(eles, "x", scope.focus.xl),
          r = plotUtils.upper_bound(eles, "x", scope.focus.xr) + 1;

      l = Math.max(l, 0);
      r = Math.min(r, eles.length - 1);

      if (l > r || l == r && eles[l].x < scope.focus.xl) {
        // nothing visible, or all elements are to the left of the svg, vlength = 0
        l = 0;
        r = -1;
      }
      this.vindexL = l;
      this.vindexR = r;
      this.vlength = r - l + 1;
    };

    PlotLineLOD.prototype.prepare = function(scope) {
      var focus = scope.focus,
          pixelWidth = scope.stdmodel.initSize.width;
      var eles = this.elements,
          eleprops = this.elementProps;
      var mapX = scope.data2scrX,
          mapY = scope.data2scrY;
      var pstr = "", skipped = false;

      this.clearresp(scope);
      this.resppipe.length = 0;
      this.elementProps.length = 0;


      var xAxis = this.xAxis;
      var xl = xAxis.getValue(focus.xl), xr = xAxis.getValue(focus.xr);

      var step = xAxis.axisStep;
      xl = Math.floor(xl / step) * step;
      xr = Math.ceil(xr / step) * step;
      xl = xAxis.getPercent(xl);
      xr = xAxis.getPercent(xr);

      var count = Math.ceil(pixelWidth / 5); // 5 pixels for each bar
      this.elementSamples = this.sampler.sample(xl, xr, count);

      var samples = this.elementSamples;
      for (var i = 0; i < samples.length; i++) {
        var ele = samples[i];
        if (i === 0) {
          pstr += "M";
        } else if (i === 1) {
          pstr += "L";
        }

        var x = mapX(ele.x), y = mapY(ele.y);
        if (Math.abs(x) > 1E6 || Math.abs(y) > 1E6) {
          skipped = true;
          break;
        }

        var id = this.id + "_" + i + "s";
        eleprops.push({
          "id" : id
        });  // create a new sample element

        var nxtp = x + "," + y + " ";

        if (focus.yl <= ele.y && ele.y <= focus.yr) {
          _(eleprops[i]).extend({
            "id" : id,
            "class" : "plot-resp plot-respdot plot-respdotsamp",
            "isresp" : true,
            "cx" : x,
            "cy" : y,
            "r" : 5,
            "tip_x" : x,
            "tip_y" : y,
            "tip_color" : this.color == null ? "gray" : this.color,
            "opacity" : scope.tips[id] == null ? 0 : 1
          });
          this.resppipe.push(eleprops[i]);
        }

        if (i < samples.length - 1) {
          if (this.interpolation === "none") {
            var ele2 = samples[i + 1];
            nxtp += mapX(ele.x) + "," + mapY(ele.y) + " " + mapX(ele2.x) + "," + mapY(ele.y) + " ";
          } else if (this.interpolation === "curve") {
            // TODO curve implementation
          }
        }

        pstr += nxtp;
      }

      if (skipped === true) {
        console.error("data not shown due to too large coordinate");
      }
      if (pstr.length > 0) {
        this.itemProps.d = pstr;
        this.createTips();
      }
    };

    PlotLineLOD.prototype.createTips = function() {
      var xAxis = this.xAxis,
          yAxis = this.yAxis;
      var samples = this.elementSamples;
      for (var i = 0; i < samples.length; i++) {
        var ele = samples[i];
        var valxl = plotUtils.getTipStringPercent(ele.xl, xAxis, 6),
            valxr = plotUtils.getTipStringPercent(ele.xr, xAxis, 6),
            valmin = plotUtils.getTipStringPercent(ele.min, yAxis),
            valmax = plotUtils.getTipStringPercent(ele.max, yAxis),
            valavg = plotUtils.getTipStringPercent(ele.avg, yAxis);

        var tip = {};
        if (this.legend != null) {
          tip.title = this.legend + " (sample)";
        }
        tip.xl = valxl;
        tip.xr = valxr;
        tip.min = valmin;
        tip.max = valmax;
        tip.avg = valavg;

        this.elementProps[i].tip_text = plotUtils.createTipString(tip);
      }
    };

    PlotLineLOD.prototype.draw = function(scope) {
      var svg = scope.maing;
      var props = this.itemProps,
          eleprops = this.elementProps,
          resppipe = this.resppipe;

      if (svg.select("#" + this.id).empty()) {
        svg.selectAll("g")
          .data([props], function(d){ return d.id; }).enter().append("g")
          .attr("id", function(d) { return d.id; });
      }

      var itemsvg = svg.select("#" + this.id);

      itemsvg.selectAll("path")
        .data([props]).enter().append("path")
        .attr("class", function(d) { return d.class; })
        .style("stroke", function(d) { return d.stroke; })
        .style("stroke-dasharray", function(d) { return d.stroke_dasharray; })
        .style("stroke-width", function(d) { return d.stroke_width; })
        .style("stroke-opacity", function(d) { return d.stroke_opacity; });
      itemsvg.select("path")
        .attr("d", props.d);

      if (scope.stdmodel.useToolTip === true) {
        itemsvg.selectAll("circle")
          .data(resppipe, function(d) { return d.id; }).exit().remove();
        itemsvg.selectAll("circle")
          .data(resppipe, function(d) { return d.id; }).enter().append("circle")
          .attr("id", function(d) { return d.id; })
          .attr("class", function(d) { return d.class; })
          .style("stroke", function(d) { return d.tip_color; });
        itemsvg.selectAll("circle")
          .data(resppipe, function(d) { return d.id; })
          .attr("cx", function(d) { return d.cx; })
          .attr("cy", function(d) { return d.cy; })
          .attr("r", function(d) { return d.r; })
          .style("opacity", function(d) { return d.opacity; });
      }
    };

    PlotLineLOD.prototype.clear = function(scope) {
      scope.maing.select("#" + this.id).remove();
      this.clearresp(scope);
    };

    PlotLineLOD.prototype.clearresp = function(scope) {
      for (var i = 0; i < this.resppipe.length; i++) {
        scope.jqcontainer.find("#tip_" + this.resppipe[i].id).remove();
        delete scope.tips[this.resppipe[i].id];
      }
    };

    return PlotLineLOD;
  };
  beaker.bkoFactory('PlotLineLOD', ['plotUtils', 'PlotSampler', 'PlotLine', retfunc]);
})();