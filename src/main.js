'use strict';
import chinamap from "./01Chinamap.js";
import production from "./02production.js";
import totalEnergyProduction from "./03totalEnergyProduction.js";
import ssankey from "./04sankey.js";
import EnergyProduction from "./05EnergyProduction.js";
import EnergyConsumption from "./06EnergyConsumption.js";
import supplydemand from "./07supplydemand.js";
import * as d3 from "d3";
import csv1 from "./assets/china.json";
import csv2 from "./assets/production.csv";
import csv3 from "./assets/total energy production.csv";
import csv4 from "./assets/sankey.json";
import csv5 from "./assets/energy production.csv";
import csv6 from "./assets/energy consumption.csv";
import csv7 from "./assets/supply and demand.csv";

// 1,2
//全国各地区不同能源生产量
d3.csv(csv2).then((data, error) => {
  if (error) {
    console.log(error);
  } else {
    //默认年份
    let selectedYear = 2015;
    let selectedData = d3.filter(data, d => { if (d["年份"] == selectedYear) return d; });
    let selectedType = 1;
    // 创建绘图函数
    const drawChart = (data, source) => {
      // 清空原有的图表
      d3.select("#svg1").selectAll("*").remove();
      chinamap(csv1, data, source, {});
      d3.select("#svg2").selectAll("*").remove();
      production(data, source, {});
    };
    // 绘制初始图表
    drawChart(selectedData, selectedType);
    // 监听下拉列表yearSelect1的选择变化
    d3.select("#yearSelect1").on("change", function () {
      selectedYear = this.value;
      selectedData = d3.filter(data, d => {
        if (d["年份"] == selectedYear) return d;
      });
      drawChart(selectedData, selectedType);
    });
    // 监听下拉列表typeSelect1的选择变化
    d3.select("#typeSelect1").on("change", function () {
      selectedType = this.value;
      selectedData = d3.filter(data, d => {
        if (d["年份"] == selectedYear) return d;
      });
      drawChart(selectedData, selectedType);
    });
  }
});

//3
//全国各地区能源总生产量
d3.csv(csv3).then((data, error) => {
  if (error) {
    console.log(error);
  } else {
    // 默认年份
    let selectedYear = 2015;
    let selectedData = d3.filter(data, d => { if (d["年份"] == selectedYear) return d; });
    // 创建绘图函数
    const drawChart = (data) => {
      // 清空原有的图表
      d3.select("#svg3").selectAll("*").remove();
      totalEnergyProduction(data, {});
    };
    // 绘制初始图表
    drawChart(selectedData);
    // 监听下拉列表的选择变化
    d3.select("#yearSelect3").on("change", function () {
      selectedYear = this.value;
      selectedData = d3.filter(data, d => {
        if (d["年份"] == selectedYear) return d;
      });
      drawChart(selectedData);
    });
  }
});

//4
//碳流图
// 保存原始数据
const originalData = JSON.parse(JSON.stringify(csv4));
// 默认年份
let selectedYear = 2015;
csv4.line = d3.filter(csv4.line, d => { if (d.year == selectedYear) return d; });
csv4.line = csv4.line[0];
// 绘制图表函数
const drawSankeyChart = (csv4) => {
  // 清空原有的图表
  d3.select("#svg4").selectAll("*").remove();
  ssankey(csv4, {
  });
};
// 绘制初始图表
drawSankeyChart(csv4);
// 监听下拉列表的选择变化
d3.select("#yearSelect4").on("change", function () {
  selectedYear = this.value;
  // 从原始数据中获取数据并进行过滤
  const filteredData = JSON.parse(JSON.stringify(originalData));
  filteredData.line = d3.filter(filteredData.line, d => { if (d.year == selectedYear) return d; });
  filteredData.line = filteredData.line[0];
  drawSankeyChart(filteredData);
});

//5,6
//能源生产/消费总量及构成
d3.csv(csv5).then((data1, error) => {
  if (error) {
    console.log(error);
  } else {
    d3.csv(csv6).then((data2, error) => {
      if (error) {
        console.log(error);
      } else {
        EnergyProduction(data1, {
        });
        EnergyConsumption(data2, {
        });
      };
    });
  };
});

//7
//供需关系
d3.csv(csv7).then((data, error) => {
  if (error) {
    console.log(error);
  } else {
    supplydemand(data, {

    });
  };
});

