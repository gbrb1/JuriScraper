using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScraperJuridico.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AdicionaGrauNaChaveComposta : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Partes_Processos_ProcessoNumeroProcesso_Tribunal",
                table: "Partes");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Processos",
                table: "Processos");

            migrationBuilder.DropIndex(
                name: "IX_Partes_ProcessoNumeroProcesso_Tribunal",
                table: "Partes");

            migrationBuilder.AddColumn<int>(
                name: "Grau",
                table: "Processos",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Grau",
                table: "Partes",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddPrimaryKey(
                name: "PK_Processos",
                table: "Processos",
                columns: new[] { "NumeroProcesso", "Tribunal", "Grau" });

            migrationBuilder.CreateIndex(
                name: "IX_Partes_ProcessoNumeroProcesso_Tribunal_Grau",
                table: "Partes",
                columns: new[] { "ProcessoNumeroProcesso", "Tribunal", "Grau" });

            migrationBuilder.AddForeignKey(
                name: "FK_Partes_Processos_ProcessoNumeroProcesso_Tribunal_Grau",
                table: "Partes",
                columns: new[] { "ProcessoNumeroProcesso", "Tribunal", "Grau" },
                principalTable: "Processos",
                principalColumns: new[] { "NumeroProcesso", "Tribunal", "Grau" },
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Partes_Processos_ProcessoNumeroProcesso_Tribunal_Grau",
                table: "Partes");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Processos",
                table: "Processos");

            migrationBuilder.DropIndex(
                name: "IX_Partes_ProcessoNumeroProcesso_Tribunal_Grau",
                table: "Partes");

            migrationBuilder.DropColumn(
                name: "Grau",
                table: "Processos");

            migrationBuilder.DropColumn(
                name: "Grau",
                table: "Partes");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Processos",
                table: "Processos",
                columns: new[] { "NumeroProcesso", "Tribunal" });

            migrationBuilder.CreateIndex(
                name: "IX_Partes_ProcessoNumeroProcesso_Tribunal",
                table: "Partes",
                columns: new[] { "ProcessoNumeroProcesso", "Tribunal" });

            migrationBuilder.AddForeignKey(
                name: "FK_Partes_Processos_ProcessoNumeroProcesso_Tribunal",
                table: "Partes",
                columns: new[] { "ProcessoNumeroProcesso", "Tribunal" },
                principalTable: "Processos",
                principalColumns: new[] { "NumeroProcesso", "Tribunal" },
                onDelete: ReferentialAction.Cascade);
        }
    }
}
